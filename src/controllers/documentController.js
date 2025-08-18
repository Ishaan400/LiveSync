const replayDocumentState = async (req, res) => {
  const { id, versionId } = req.params;
  try {
    const targetVersion = await DocumentVersion.findById(versionId);
    if (!targetVersion || targetVersion.docId.toString() !== id) {
      return res.status(404).json({ error: 'Version not found' });
    }
    const versions = await DocumentVersion.find({ docId: id })
      .sort({ timestamp: 1 }) // Changed from _id to timestamp
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
    logger.info(`Document state replayed for docId: ${id}, version: ${versionId} by user ${req.user.id} [Request ${req.requestId}]`);
    res.json({ doc: Buffer.from(docBinary).toString('base64') });
  } catch (err) {
    logger.error(`Error replaying document state: ${err.message} [Request ${req.requestId}]`);
    res.status(500).json({ error: 'Server error' });
  }
};