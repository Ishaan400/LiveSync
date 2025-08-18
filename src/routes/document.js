const express = require('express');
const router = express.Router();
const passport = require('passport');
const Automerge = require('@automerge/automerge');
const Document = require('../models/Document');
const DocumentVersion = require('../models/DocumentVersion');
const ActivityLog = require('../models/ActivityLog');
const HistoryEntry = require('../models/HistoryEntry'); // New
const { pub } = require('../utils/redis'); // Added for Automerge seeding
const logger = require('../utils/logger');
const DocumentService = require('../services/documentService');

/**
 * @swagger
 * /documents:
 *   get:
 *     summary: Get all documents for the authenticated user
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of documents
 *       500:
 *         description: Server error
 */
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const documents = await Document.find({
      $or: [{ owner: req.user.id }, { 'participants.userId': req.user.id }]
    })
    .populate('owner', 'username')
    .populate('participants.userId', 'username');
    logger.info(`Fetched documents for user ${req.user.id} [Request ${req.requestId}]`);
    res.json(documents);
  } catch (err) {
    logger.error(`Error fetching documents: ${err.message} [Request ${req.requestId}]`);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a specific document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document retrieved
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('owner', 'username')
      .populate('participants.userId', 'username');

    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const ownerId = String(doc.owner._id);
    const isParticipant = doc.participants.some(p => String(p.userId._id) === req.user.id);
    if (ownerId !== req.user.id && !isParticipant) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Create a new document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *     responses:
 *       201:
 *         description: Document created
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const doc = new Document({
      title,
      owner: req.user.id,
      participants: []
    });
    await doc.save();

    // --- Seed Automerge state in Redis ---
    let initDoc = Automerge.init();
    initDoc = Automerge.change(initDoc, d => { d.text = ''; });
    const changes = Automerge.getAllChanges(initDoc).map(c => Buffer.from(c).toString('base64'));
    await pub.set(`doc:${doc._id}`, JSON.stringify(changes));
    // --- End seed ---

    await new ActivityLog({ docId: doc._id, userId: req.user.id, action: 'create' }).save();
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /documents/{id}:
 *   put:
 *     summary: Update a document's title
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document updated
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 *       500:
 *         description: Server error
 */
router.put('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const doc = await Document.findById(req.params.id)
      .populate('owner', 'username')
      .populate('participants.userId', 'username');
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const ownerId = String(doc.owner._id);
    const canEdit = doc.participants.some(p => String(p.userId._id) === req.user.id && p.role === 'editor');
    if (ownerId !== req.user.id && !canEdit) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const oldTitle = doc.title;
    doc.title = title;
    await doc.save();
    await new ActivityLog({ docId: doc._id, userId: req.user.id, action: 'update' }).save();

    // Save title change history
    if (oldTitle !== title) {
      try {
        await HistoryEntry.create({
          documentId: doc._id,
          type: 'metadata',
          operation: 'update-title',
          payload: { title: { from: oldTitle, to: title } },
          userId: req.user.id
        });
      } catch (e) {
        console.error('History write failed:', e);
      }
    }

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Document deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('owner', 'username');
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const ownerId = String(doc.owner._id);
    if (ownerId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    await Document.deleteOne({ _id: req.params.id });
    await new ActivityLog({ docId: req.params.id, userId: req.user.id, action: 'delete' }).save();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /documents/{id}/share:
 *   post:
 *     summary: Share a document with another user
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [editor, viewer]
 *     responses:
 *       200:
 *         description: User granted access
 *       400:
 *         description: Already shared
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 *       500:
 *         description: Server error
 */
router.post('/:id/share', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    await DocumentService.shareDocument(
      req.params.id,
      req.user.id,
      req.body.userId,
      req.body.role,
      req.requestId
    );
    await new ActivityLog({
      docId: req.params.id,
      userId: req.user.id,
      action: `share_${req.body.role}`
    }).save();
    res.status(200).json({ message: 'User added as collaborator' });
  } catch (err) {
    res.status(
      err.message === 'Document not found' || err.message === 'User to share with not found' ? 404 :
      err.message === 'Not authorized to share this document' ? 403 :
      err.message === 'User already has access' ? 400 : 500
    ).json({ error: err.message });
  }
});

/**
 * @swagger
 * /documents/{id}/history:
 *   get:
 *     summary: Get all versions for a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of version metadata
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */
router.get('/:id/history', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const docId = req.params.id;
    const contentHistory = await DocumentVersion.find({ docId }).sort({ timestamp: 1 }).lean();
    const metaHistory = await HistoryEntry.find({ documentId: docId, type: 'metadata' }).sort({ timestamp: 1 }).lean();
    const merged = [...contentHistory.map(v => ({ ...v, source: 'content' })), ...metaHistory.map(v => ({ ...v, source: 'metadata' }))];
    merged.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /documents/{id}/replay/{versionId}:
 *   get:
 *     summary: Replay document state up to a version
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Base64‑encoded document snapshot
 *       404:
 *         description: Version not found
 *       500:
 *         description: Server error
 */
router.get('/:id/replay/:versionId', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const allVersions = await DocumentVersion.find({ docId: id }).sort({ timestamp: 1 }).lean();

    let doc = Automerge.init();
    for (const v of allVersions) {
      if (v._id.toString() <= versionId) {
        doc = Automerge.applyChanges(doc, [v.update])[0];
      } else break;
    }

    const binary = Automerge.save(doc);
    res.json({ doc: Buffer.from(binary).toString('base64') });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

