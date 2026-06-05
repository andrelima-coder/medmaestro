-- 013_edital_topics_refino.sql
-- Subtemas adicionados no refino pós-auditoria (padrões de erro recorrentes):
-- infecções específicas/tropicais (malária, endocardite forçadas em sepse/IRAS)
-- e doenças neuromusculares (miastenia/GBS forçadas em rebaixamento).
DO $$
DECLARE tax uuid := 'a2bf0a38-8618-48ec-b735-2a49b9046c7a';
BEGIN
  INSERT INTO tags (taxonomy_id, dimension, slug, label, color, display_order, parent_tag_id)
  SELECT tax, 'topico_edital', s.slug, s.label, p.color, s.ord, p.id
  FROM (VALUES
    ('ed_sepse_infeccoes','ed_inf_especificas','Infecções específicas e doenças tropicais (endocardite, malária, dengue, etc.)',307),
    ('ed_neuro','ed_neu_neuromuscular','Doenças neuromusculares no crítico (miastenia, Guillain-Barré, PNM)',506)
  ) AS s(parent_slug, slug, label, ord)
  JOIN tags p ON p.slug = s.parent_slug AND p.taxonomy_id = tax AND p.dimension = 'topico_edital'
  WHERE NOT EXISTS (SELECT 1 FROM tags x WHERE x.slug=s.slug AND x.taxonomy_id=tax);
END $$;
