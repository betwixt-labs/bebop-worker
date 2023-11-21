# bebopc-worker

This project uses WASI support for Cloudflare Workers to run `bebopc` inside of a Javascript worker showing off the capabilities of the experiential WASI target of `bebopc`.

# Usage

```bash
npm install
npm run dev
```

Once the worker is running, you can send it a POST request to generate code from a schema.

```bash
curl -X POST http://127.0.0.1:8787 \
     -H "Content-Type: application/json" \
     -d '{
         "generator": "ts",
         "outFile": "test.ts",
         "namespace": "Betwixt",
         "schema": "enum Instrument {\n    Sax = 0;\n    Trumpet = 1;\n    Clarinet = 2;\n}\n\n/* test */\n[opcode(\"JAZZ\")]\nreadonly struct Musician {\n    /* a name */\n    string name;\n\t/* an instrument */\n    Instrument plays;\n}\n\nmessage Song {\n    1 -> string title;\n    2 -> uint16 year;\n    3 -> Musician[] performers;\n}\n\nstruct Library {\n    map[guid, Song] songs;\n}"
     }'
```
