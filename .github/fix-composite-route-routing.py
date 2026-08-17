from pathlib import Path

path = Path('record-renderer.js')
text = path.read_text()
old_signature = "  async function renderRecordMap(record, compositeContext = null) {"
new_signature = "  let activeCompositeRouteContext = null;\n  async function renderRecordMap(record) {\n    const compositeContext = activeCompositeRouteContext;"
if text.count(old_signature) != 1:
    raise SystemExit(f'record-renderer.js: expected transformed map signature once, found {text.count(old_signature)}')
text = text.replace(old_signature, new_signature, 1)
old_call = "      await renderRecordMap(record, compositeContext);"
new_call = "      activeCompositeRouteContext = compositeContext;\n      await renderRecordMap(record);"
if text.count(old_call) != 1:
    raise SystemExit(f'record-renderer.js: expected transformed map call once, found {text.count(old_call)}')
path.write_text(text.replace(old_call, new_call, 1))
