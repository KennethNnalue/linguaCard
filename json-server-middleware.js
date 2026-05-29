const fs = require('fs');
const path = require('path');

module.exports = (req, res, next) => {
  // POST /stories/generate → return first seed story with a new id + current timestamp
  if (req.method === 'POST' && req.path === '/stories/generate') {
    const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
    const seed = db.stories && db.stories[0];
    if (!seed) {
      return res.status(500).json({ message: 'No seed story found in db.json' });
    }
    const story = {
      ...seed,
      id: `story-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      listenCount: 0,
      lastListenedAt: null,
    };
    // Persist to db so GET /stories returns it
    db.stories.push(story);
    fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));
    return res.status(201).json(story);
  }
  next();
};
