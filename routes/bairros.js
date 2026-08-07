const express = require('express');

module.exports = function criarRouterBairros({
  asyncRoute,
  deleteRow,
  exigirP3,
  generateId,
  normalizarTextoServer,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
}) {
  const router = express.Router();

  router.get('/bairros-coordenadas', asyncRoute(async (_req, res) => {
    res.json(await readTabela('bairros_coordenadas'));
  }));

  router.post('/bairros-coordenadas', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCampos(req.body, {
      nome_bairro: { obrigatorio: true, tipo: 'string', max: 100, label: 'Nome do Bairro' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const { latitude, longitude } = req.body;
    const informouAlguma = latitude !== undefined && latitude !== '' || longitude !== undefined && longitude !== '';
    let lat = null;
    let lon = null;
    if (informouAlguma) {
      lat = parseFloat(latitude);
      lon = parseFloat(longitude);
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'Informe latitude e longitude juntas, ambas numéricas — ou deixe as duas em branco.' });
      }
    }

    const bairros = await readTabela('bairros_coordenadas');
    if (bairros.some(b => normalizarTextoServer(b.nome_bairro) === normalizarTextoServer(v.valores.nome_bairro))) {
      return res.status(409).json({ error: 'Já existe um bairro cadastrado com esse nome.' });
    }

    const novoBairro = { id: generateId('bco'), nome_bairro: v.valores.nome_bairro, latitude: lat, longitude: lon };
    await writeRow('bairros_coordenadas', novoBairro);
    res.status(201).json(novoBairro);
  }));

  router.put('/bairros-coordenadas/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: bairro, error: erroBusca } = await supabase
      .from('bairros_coordenadas').select('*').eq('id', req.params.id).maybeSingle();
    if (erroBusca) throw new Error(`Falha ao ler "bairros_coordenadas" do Supabase: ${erroBusca.message}`);
    if (!bairro) return res.status(404).json({ error: 'Bairro não encontrado.' });

    if (req.body.nome_bairro !== undefined) bairro.nome_bairro = String(req.body.nome_bairro).trim();
    if (req.body.latitude !== undefined) {
      if (req.body.latitude === '' || req.body.latitude === null) bairro.latitude = null;
      else {
        const lat = parseFloat(req.body.latitude);
        if (isNaN(lat)) return res.status(400).json({ error: 'Latitude inválida.' });
        bairro.latitude = lat;
      }
    }
    if (req.body.longitude !== undefined) {
      if (req.body.longitude === '' || req.body.longitude === null) bairro.longitude = null;
      else {
        const lon = parseFloat(req.body.longitude);
        if (isNaN(lon)) return res.status(400).json({ error: 'Longitude inválida.' });
        bairro.longitude = lon;
      }
    }

    await writeRow('bairros_coordenadas', bairro);
    res.json(bairro);
  }));

  router.delete('/bairros-coordenadas/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: bairro, error: erroBusca } = await supabase
      .from('bairros_coordenadas').select('id').eq('id', req.params.id).maybeSingle();
    if (erroBusca) throw new Error(`Falha ao ler "bairros_coordenadas" do Supabase: ${erroBusca.message}`);
    if (!bairro) return res.status(404).json({ error: 'Bairro não encontrado.' });
    await deleteRow('bairros_coordenadas', req.params.id);
    res.json({ message: 'Bairro excluído.' });
  }));

  return router;
};
