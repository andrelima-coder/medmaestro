-- 012_edital_topics_gaps.sql
-- Subtemas adicionados após o piloto de classificação revelar lacunas do edital:
-- PCR/RCP, controle glicêmico, toxicologia e doenças do pericárdio.
DO $$
DECLARE tax uuid := 'a2bf0a38-8618-48ec-b735-2a49b9046c7a';
BEGIN
  INSERT INTO tags (taxonomy_id, dimension, slug, label, color, display_order, parent_tag_id)
  SELECT tax, 'topico_edital', s.slug, s.label, p.color, s.ord, p.id
  FROM (VALUES
    ('ed_monitorizacao_suporte','ed_mon_pcr','Parada cardiorrespiratória e ressuscitação (RCP)',207),
    ('ed_periop_clinico','ed_per_controle_glicemico','Controle glicêmico no paciente crítico',606),
    ('ed_periop_clinico','ed_per_toxicologia','Toxicologia e intoxicações exógenas',607),
    ('ed_periop_clinico','ed_per_pericardio','Tamponamento e doenças do pericárdio',608)
  ) AS s(parent_slug, slug, label, ord)
  JOIN tags p ON p.slug = s.parent_slug AND p.taxonomy_id = tax AND p.dimension = 'topico_edital';
END $$;
