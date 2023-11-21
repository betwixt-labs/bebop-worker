// Importing the WASI module from the Cloudflare Workers WASI package and the WebAssembly binary.
import { WASI } from '@cloudflare/workers-wasi';
//@ts-ignore
import mywasm from '../assets/bebopc.wasm';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Empty interface representing the environment - can be extended for future use.
export interface Env {}

// Array of supported generator aliases.
const generatorAlias = ['cs', 'cpp', 'rust', 'py', 'ts', 'dart'] as const;
type GeneratorAlias = typeof generatorAlias[number];

// Function to validate if a given input is a valid generator alias.
function isValidGenerator(maybeGeneratorAlias: unknown): maybeGeneratorAlias is GeneratorAlias {
    return typeof maybeGeneratorAlias === 'string' && generatorAlias.includes(maybeGeneratorAlias as GeneratorAlias);
}

// Function to create a ReadableStream from a given string.
function streamFromString(str: string): ReadableStream {
    const encoded = encoder.encode(str);
    const transformer = new TransformStream();
    const writer = transformer.writable.getWriter();
    writer.write(encoded);
    writer.close();
    return transformer.readable;
}

// Function to create two streams (original and checker) from a given ReadableStream using tee.
function teeStream(stream: ReadableStream) {
    const teedStreams = stream.tee();
    return {
        original: teedStreams[0],
        checker: teedStreams[1],
    };
}

// Async function to check if any data has been written to a given ReadableStream.
async function hasDataBeenWrittenToStream(stream: ReadableStream) {
    const reader = stream.getReader();
    const { done } = await reader.read();
    reader.releaseLock();
    return !done;
}

// Async function to convert a ReadableStream to a string.
async function streamToString(stream: ReadableStream): Promise<string> {
    const reader = stream.getReader();
    let chunks = '';
    let result;
    while (!(result = await reader.read()).done) {
        chunks += decoder.decode(result.value, { stream: true });
    }
    return chunks;
}

// Interface representing the structure of a compilation request.
interface CompileRequest {
    generator: GeneratorAlias;
    outFile: string;
    namespace?: string;
    schema: string;
}

// Main fetch handler for the Cloudflare Worker.
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*', // Allows requests from any origin
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle OPTIONS request for CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { 
                status: 204,
                headers: corsHeaders
            });
        }
        // Check for POST method, return error response if method is not POST.
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: `Method not allowed: ${request.method}` }), {
                status: 405,
                headers: {   ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
            });
        }
        const body = (await request.json()) as CompileRequest;

        // Validate the generator, return error response if invalid.
        if (!isValidGenerator(body.generator)) {
            return new Response(JSON.stringify({ error: 'Invalid generator' }), {
                status: 400,
                headers: {   ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
            });
        }

        // Initialize stdout and stderr as TransformStreams.
        const stdout = new TransformStream();
        const stderr = new TransformStream();

        // Construct arguments for the WASI instance.
        const args = ['bebopc', `--${body.generator}`, `${body.outFile}`, '--in', '--out'];
        if (body.namespace) {
            args.push('--namespace', body.namespace);
        }

        // Configure the WASI instance with stdin, stdout, stderr, and arguments.
        const wasi = new WASI({
            args: args,
            stdin: streamFromString(body.schema),
            stdout: stdout.writable,
            stderr: stderr.writable,
        });

        // Custom WASI import, including handling for the 'sock_accept' function.
        const wasiImport = {
            ...wasi.wasiImport,
			// We need to stub 'sock_accept' because the wasi workflow in .NET 8 adds an import for it
			// Despite us not actually using it.
            sock_accept: () => {
                console.log('sock_accept called');
                throw new Error('sock_accept not implemented');
            },
        };

        // Instantiate the WebAssembly module with the configured WASI import.
        const instance = new WebAssembly.Instance(mywasm, {
            wasi_snapshot_preview1: wasiImport,
        });

        // Ensure the worker remains active until the WASM execution completes.
        ctx.waitUntil(wasi.start(instance));

        // Tee the stderr stream to check for any data.
        const { original: originalStderr, checker: checkStderr } = teeStream(stderr.readable);
        if (await hasDataBeenWrittenToStream(checkStderr)) {
            // If stderr has data, read it, and return as an error response.
            const stderrContent = await streamToString(originalStderr);
            return new Response(JSON.stringify({ error: stderrContent }), {
                status: 422,
                headers: {   ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
            });
        }
        // If no error, return stdout content in the response.
        return new Response(stdout.readable, {
            status: 200,
            headers: {
                ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8',
            },
        });
    },
};
