-- 011_edital_topics_and_tema_filter.sql
-- (a) Popula a taxonomia 'edital_temi_amib_2026' (dimension topico_edital) com
--     os 9 eixos do edital TEMI/AMIB 2026 (nível 1) + 44 subtemas (nível 2).
-- (b) Atualiza search_questions() para que o filtro de tema reconheça a
--     hierarquia: filtrar por um eixo agrega todas as questões de seus subtemas.

DO $$
DECLARE
  tax uuid := 'a2bf0a38-8618-48ec-b735-2a49b9046c7a'; -- edital_temi_amib_2026
BEGIN
  -- ---- Eixos (nível 1) -------------------------------------------------
  INSERT INTO tags (taxonomy_id, dimension, slug, label, color, display_order) VALUES
    (tax,'topico_edital','ed_fundamentos','Fundamentos de Fisiologia e Fisiopatologia','#6366F1',1),
    (tax,'topico_edital','ed_monitorizacao_suporte','Monitorização e Suporte Hemodinâmico e Respiratório','#06B6D4',2),
    (tax,'topico_edital','ed_sepse_infeccoes','Sepse, Infecções Graves e Antimicrobianos','#EF4444',3),
    (tax,'topico_edital','ed_insuficiencias_orgaos','Insuficiências Orgânicas e Suporte de Órgãos','#F59E0B',4),
    (tax,'topico_edital','ed_neuro','Emergências Neurológicas e Neurointensivismo','#A855F7',5),
    (tax,'topico_edital','ed_periop_clinico','Cuidados Intensivos Perioperatórios e Clínicos','#10B981',6),
    (tax,'topico_edital','ed_paliativos_etica','Cuidados Paliativos, Comunicação e Ética em UTI','#EC4899',7),
    (tax,'topico_edital','ed_gestao_qualidade','Gestão, Qualidade e Segurança do Paciente','#3B82F6',8),
    (tax,'topico_edital','ed_metodologia','Metodologia Científica, Epidemiologia e Leitura Crítica','#14B8A6',9);

  -- ---- Subtemas (nível 2) ----------------------------------------------
  -- parent_tag_id resolvido pelo slug do eixo; color herdada do eixo.
  INSERT INTO tags (taxonomy_id, dimension, slug, label, color, display_order, parent_tag_id)
  SELECT tax, 'topico_edital', s.slug, s.label, p.color, s.ord, p.id
  FROM (VALUES
    -- Eixo 1
    ('ed_fundamentos','ed_fund_fisiologia','Fisiologia dos sistemas (cardio, resp, renal, neuro, metab, imuno)',101),
    ('ed_fundamentos','ed_fund_resposta_estresse','Resposta ao estresse, inflamação sistêmica e DMOS',102),
    ('ed_fundamentos','ed_fund_interpretacao','Interpretação de variáveis clínicas, laboratoriais e hemodinâmicas',103),
    -- Eixo 2
    ('ed_monitorizacao_suporte','ed_mon_monitorizacao','Monitorização clínica e avançada',201),
    ('ed_monitorizacao_suporte','ed_mon_perfusao','Avaliação de perfusão e oxigenação tecidual',202),
    ('ed_monitorizacao_suporte','ed_mon_ventilacao','Ventilação mecânica (VMI/VNI), ajustes e desmame',203),
    ('ed_monitorizacao_suporte','ed_mon_disturbios_oxi_vent','Distúrbios da oxigenação e da ventilação',204),
    ('ed_monitorizacao_suporte','ed_mon_choque','Choque: classificação, diagnóstico e manejo',205),
    ('ed_monitorizacao_suporte','ed_mon_suporte_circulatorio','Suporte circulatório farmacológico e não farmacológico',206),
    -- Eixo 3
    ('ed_sepse_infeccoes','ed_inf_sepse','Sepse e choque séptico',301),
    ('ed_sepse_infeccoes','ed_inf_pneumonia','Pneumonia (comunitária, hospitalar e associada à VM)',302),
    ('ed_sepse_infeccoes','ed_inf_iras','Infecções relacionadas à assistência (IRAS)',303),
    ('ed_sepse_infeccoes','ed_inf_antimicrobianos','Uso racional de antimicrobianos e multirresistência',304),
    ('ed_sepse_infeccoes','ed_inf_febre','Febre no paciente crítico',305),
    ('ed_sepse_infeccoes','ed_inf_prevencao','Prevenção e controle de infecções em UTI',306),
    -- Eixo 4
    ('ed_insuficiencias_orgaos','ed_insuf_respiratoria','Insuficiência respiratória aguda (incluindo SARA)',401),
    ('ed_insuficiencias_orgaos','ed_insuf_renal','Injúria renal aguda e terapias de substituição renal',402),
    ('ed_insuficiencias_orgaos','ed_insuf_cardiovascular','Disfunção CV aguda, SCA, choque cardiogênico e TEP',403),
    ('ed_insuficiencias_orgaos','ed_insuf_hepatica','Insuficiência hepática aguda e crônica agudizada',404),
    ('ed_insuficiencias_orgaos','ed_insuf_hidroeletrolitico','Distúrbios hidroeletrolíticos e ácido-base',405),
    ('ed_insuficiencias_orgaos','ed_insuf_hematologico','Distúrbios hematológicos e coagulopatias',406),
    ('ed_insuficiencias_orgaos','ed_insuf_hemorragia_trauma','Grandes hemorragias e trauma',407),
    -- Eixo 5
    ('ed_neuro','ed_neu_avc','AVC isquêmico e hemorrágico',501),
    ('ed_neuro','ed_neu_hic_hsa','Hemorragia intracraniana espontânea e subaracnoide',502),
    ('ed_neuro','ed_neu_lesao_encefalica','Lesão encefálica aguda',503),
    ('ed_neuro','ed_neu_morte_encefalica','Morte encefálica e cuidados ao potencial doador',504),
    ('ed_neuro','ed_neu_eme_rebaixamento','Estado de mal epiléptico e rebaixamento de consciência',505),
    -- Eixo 6
    ('ed_periop_clinico','ed_per_paciente_cirurgico','Avaliação e manejo do paciente cirúrgico crítico',601),
    ('ed_periop_clinico','ed_per_emergencias_cv','Síndromes coronarianas agudas e emergências cardiovasculares',602),
    ('ed_periop_clinico','ed_per_complicacoes_pos_op','Complicações pós-operatórias em UTI',603),
    ('ed_periop_clinico','ed_per_nutricao','Terapia nutricional no paciente grave',604),
    ('ed_periop_clinico','ed_per_sedacao','Sedação, analgesia, delirium, mobilização e sono',605),
    -- Eixo 7
    ('ed_paliativos_etica','ed_pal_paliativos','Princípios de cuidados paliativos em terapia intensiva',701),
    ('ed_paliativos_etica','ed_pal_comunicacao','Comunicação de más notícias e decisão compartilhada',702),
    ('ed_paliativos_etica','ed_pal_limitacao_suporte','Limitação e adequação de suporte de vida',703),
    ('ed_paliativos_etica','ed_pal_etica','Ética médica aplicada à UTI',704),
    ('ed_paliativos_etica','ed_pal_legal','Aspectos legais e normativos',705),
    -- Eixo 8
    ('ed_gestao_qualidade','ed_ges_organizacao','Organização e funcionamento de UTIs',801),
    ('ed_gestao_qualidade','ed_ges_seguranca','Segurança do paciente e prevenção de eventos adversos',802),
    ('ed_gestao_qualidade','ed_ges_protocolos','Protocolos assistenciais e gestão de processos',803),
    ('ed_gestao_qualidade','ed_ges_indicadores','Indicadores de qualidade e melhoria contínua',804),
    -- Eixo 9
    ('ed_metodologia','ed_met_epi_bioestatistica','Epidemiologia clínica e bioestatística',901),
    ('ed_metodologia','ed_met_leitura_critica','Interpretação crítica de estudos, diretrizes e revisões',902),
    ('ed_metodologia','ed_met_evidencias','Avaliação de evidências para tomada de decisão clínica',903)
  ) AS s(parent_slug, slug, label, ord)
  JOIN tags p ON p.slug = s.parent_slug AND p.taxonomy_id = tax AND p.dimension = 'topico_edital';
END $$;

-- ---- (b) Filtro de tema ciente da hierarquia ---------------------------
CREATE OR REPLACE FUNCTION search_questions(
  p_modulo       text[] DEFAULT '{}',
  p_tema         text[] DEFAULT '{}',
  p_tipo         text[] DEFAULT '{}',
  p_recurso      text[] DEFAULT '{}',
  p_dificuldade  text[] DEFAULT '{}',
  p_banca        text[] DEFAULT '{}',
  p_year         int[]  DEFAULT '{}',
  p_status       text[] DEFAULT '{}',
  p_classificacao text  DEFAULT NULL,
  p_search       text   DEFAULT NULL,
  p_limit        int    DEFAULT 20,
  p_offset       int    DEFAULT 0
)
RETURNS TABLE(total bigint, rows jsonb)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT q.id, q.question_number, e.year
    FROM questions q
    JOIN exams e ON e.id = q.exam_id
    LEFT JOIN exam_boards b ON b.id = e.board_id
    WHERE
      (cardinality(p_year)  = 0 OR e.year = ANY(p_year))
      AND (cardinality(p_banca) = 0 OR b.slug = ANY(p_banca))
      AND (cardinality(p_status) = 0 OR q.status::text = ANY(p_status))
      AND (p_search IS NULL OR p_search = '' OR q.stem ILIKE '%' || p_search || '%')
      AND (cardinality(p_modulo) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'modulo' AND t.slug = ANY(p_modulo)))
      AND (cardinality(p_tema) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt
            JOIN tags t ON t.id = qt.tag_id AND t.dimension = 'topico_edital'
            LEFT JOIN tags pt ON pt.id = t.parent_tag_id
            WHERE qt.question_id = q.id
              AND (t.slug = ANY(p_tema) OR pt.slug = ANY(p_tema))))
      AND (cardinality(p_tipo) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'tipo_questao' AND t.slug = ANY(p_tipo)))
      AND (cardinality(p_recurso) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'recurso_visual' AND t.slug = ANY(p_recurso)))
      AND (cardinality(p_dificuldade) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'dificuldade' AND t.slug = ANY(p_dificuldade)))
      AND (
        p_classificacao IS NULL
        OR (p_classificacao = 'classificadas' AND EXISTS (
              SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
              WHERE qt.question_id = q.id AND t.dimension = 'modulo'))
        OR (p_classificacao = 'nao' AND NOT EXISTS (
              SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
              WHERE qt.question_id = q.id AND t.dimension = 'modulo'))
      )
  ),
  page AS (
    SELECT id FROM filtered
    ORDER BY year DESC, question_number ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    (SELECT count(*) FROM filtered) AS total,
    COALESCE((
      SELECT jsonb_agg(rd ORDER BY ord_year DESC, ord_qn ASC)
      FROM (
        SELECT
          e.year AS ord_year,
          q.question_number AS ord_qn,
          jsonb_build_object(
            'id', q.id,
            'question_number', q.question_number,
            'stem', left(COALESCE(q.stem, ''), 160),
            'stem_len', length(COALESCE(q.stem, '')),
            'status', q.status,
            'has_images', q.has_images,
            'correct_answer', q.correct_answer,
            'year', e.year,
            'board', b.short_name,
            'tags', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object('label', t.label, 'dimension', t.dimension, 'color', t.color)
                ORDER BY t.display_order NULLS LAST, t.label)
              FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
              WHERE qt.question_id = q.id
            ), '[]'::jsonb)
          ) AS rd
        FROM page
        JOIN questions q ON q.id = page.id
        JOIN exams e ON e.id = q.exam_id
        LEFT JOIN exam_boards b ON b.id = e.board_id
      ) sub
    ), '[]'::jsonb) AS rows;
$$;
