// src/models/HistoryEntry.js
const mongoose = require('mongoose');

const HistoryEntrySchema = new mongoose.Schema({
  documentId:    { type: mongoose.Types.ObjectId, required: true, index: true },
  type:          { type: String,         enum: ['content','metadata'], required: true },
  operation:     { type: String,         required: true },               // e.g. 'update-title', 'automerge-change'
  payload:       { type: mongoose.Schema.Types.Mixed, required: true }, // diffs or Automerge change chunk
  userId:        { type: mongoose.Types.ObjectId, required: true },
  timestamp:     { type: Date,           default: Date.now,   index: true },
});

module.exports = mongoose.model('HistoryEntry', HistoryEntrySchema);
