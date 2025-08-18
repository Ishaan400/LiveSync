const Document = require('../models/Document');
const DocumentVersion = require('../models/DocumentVersion');
const User = require('../models/User');
const Automerge = require('@automerge/automerge');
const logger = require('../utils/logger');

class DocumentService {
  static async shareDocument(docId, ownerId, userId, role, requestId) {
    const doc = await Document.findById(docId);
    if (!doc) {
      logger.warn(`Document ${docId} not found [Request ${requestId}]`);
      throw new Error('Document not found');
    }
    if (doc.owner.toString() !== ownerId) {
      logger.warn(`User ${ownerId} not authorized to share document ${docId} [Request ${requestId}]`);
      throw new Error('Not authorized to share this document');
    }
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`User ${userId} not found [Request ${requestId}]`);
      throw new Error('User to share with not found');
    }
    if (doc.participants.some(p => p.userId.toString() === userId)) {
      logger.warn(`User ${userId} already has access to document ${docId} [Request ${requestId}]`);
      throw new Error('User already has access');
    }
    if (!['editor', 'viewer'].includes(role)) {
      logger.warn(`Invalid role ${role} for document ${docId} [Request ${requestId}]`);
      throw new Error('Invalid role');
    }
    doc.participants.push({ userId, role });
    await doc.save();
    logger.info(`Document ${docId} shared with user ${userId} as ${role} [Request ${requestId}]`);
  }

  static async replayDocumentState(docId, versionId, requestId) {
    try {
      const targetVersion = await DocumentVersion.findById(versionId);
      if (!targetVersion || targetVersion.docId.toString() !== docId) {
        logger.warn(`Version ${versionId} not found for docId ${docId} [Request ${requestId}]`);
        throw new Error('Version not found');
      }
      const versions = await DocumentVersion.find({ docId })
        .sort({ timestamp: 1 })
        .lean();
      let doc = Automerge.init();
      for (const version of versions) {
        if (version._id.toString() <= versionId) {
          doc = Automerge.applyChanges(doc, [version.update])[0];
        } else {
          break;
        }
      }
      const docBinary = Automerge.save(doc);
      logger.info(`Document state replayed for docId: ${docId}, version: ${versionId} [Request ${requestId}]`);
      return Buffer.from(docBinary).toString('base64');
    } catch (err) {
      logger.error(`Error replaying document state: ${err.message} [Request ${requestId}]`);
      throw err;
    }
  }
}

module.exports = DocumentService;