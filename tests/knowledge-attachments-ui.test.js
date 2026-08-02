'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'knowledge-ui.js'), 'utf8');
assert.match(source, /id="knowledgeAttachmentInput"/);
assert.match(source, /type="file" multiple/);
assert.match(source, /readKnowledgeFile/);
assert.match(source, /BpsKnowledgeLogic\.validateAttachments/);
assert.match(source, /data-knowledge-attachment-remove/);
assert.match(source, /knowledgeAttachmentRows\(documents, false\)/);

console.log('knowledge-attachments-ui: форма, чтение, валидация и просмотр документов подключены');
