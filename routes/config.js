const express = require('express');

module.exports = function criarRouterConfig({
  asyncRoute,
  buscarConfig,
  exigirP3,
  readDB,
  writeDB,
}) {
  const router = express.Router();

  router.get('/config', asyncRoute(async (_req, res) => {
    res.json(await buscarConfig());
  }));

  router.put('/config', exigirP3, asyncRoute(async (req, res) => {
    const db = await readDB();
    const cota = parseInt(req.body.cota_mensal_diarias, 10);
    if (isNaN(cota) || cota < 0) {
      return res.status(400).json({ error: 'Cota inválida. Informe um número inteiro maior ou igual a 0.' });
    }

    db.config = db.config || {};
    db.config.cota_mensal_diarias = cota;
    await writeDB(db, ['config']);
    res.json(db.config);
  }));

  return router;
};
