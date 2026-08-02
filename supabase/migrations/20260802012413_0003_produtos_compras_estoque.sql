CREATE SEQUENCE public.seq_codigo_produto START 1000;

CREATE TABLE public.produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT NOT NULL DEFAULT ('P' || nextval('public.seq_codigo_produto')),
    nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 200),
    descricao TEXT,
    categoria_id UUID REFERENCES public.categorias(id) ON DELETE RESTRICT,
    marca_id UUID REFERENCES public.marcas(id) ON DELETE RESTRICT,
    cor TEXT, tamanho TEXT,
    unidade TEXT NOT NULL DEFAULT 'UN',
    codigo_barras TEXT, foto_url TEXT, foto_thumb_url TEXT,
    custo_medio NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (custo_medio >= 0),
    ultimo_custo NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (ultimo_custo >= 0),
    preco_consumidor NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (preco_consumidor >= 0),
    preco_revendedor NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (preco_revendedor >= 0),
    qtd_disponivel NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_disponivel >= 0),
    qtd_reservado  NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_reservado  >= 0),
    qtd_mostruario NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_mostruario >= 0),
    qtd_consignado NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_consignado >= 0),
    qtd_total NUMERIC(14,3) GENERATED ALWAYS AS
      (qtd_disponivel + qtd_reservado + qtd_mostruario + qtd_consignado) STORED,
    estoque_minimo NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
    lucro_consumidor NUMERIC(14,4) GENERATED ALWAYS AS (preco_consumidor - custo_medio) STORED,
    lucro_revendedor NUMERIC(14,4) GENERATED ALWAYS AS (preco_revendedor - custo_medio) STORED,
    margem_consumidor NUMERIC(9,4) GENERATED ALWAYS AS
      (CASE WHEN preco_consumidor > 0 THEN (preco_consumidor - custo_medio)/preco_consumidor*100 ELSE 0 END) STORED,
    margem_revendedor NUMERIC(9,4) GENERATED ALWAYS AS
      (CASE WHEN preco_revendedor > 0 THEN (preco_revendedor - custo_medio)/preco_revendedor*100 ELSE 0 END) STORED,
    data_ultima_entrada DATE, data_ultima_saida DATE,
    ativo BOOLEAN NOT NULL DEFAULT true, observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.usuarios(id),
    updated_by UUID REFERENCES public.usuarios(id),
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_produtos_codigo ON public.produtos (upper(codigo)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_produtos_ean ON public.produtos (codigo_barras) WHERE codigo_barras IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_produtos_nome ON public.produtos USING gin (public.fn_norm(nome) extensions.gin_trgm_ops);
CREATE INDEX idx_produtos_busca ON public.produtos USING gin
  (public.fn_norm(coalesce(nome,'') || ' ' || coalesce(codigo,'')) extensions.gin_trgm_ops);
CREATE INDEX idx_produtos_categoria ON public.produtos (categoria_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_produtos_marca ON public.produtos (marca_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_produtos_disponivel ON public.produtos (qtd_disponivel) WHERE deleted_at IS NULL AND ativo;
CREATE INDEX idx_produtos_parados ON public.produtos (data_ultima_saida NULLS FIRST) WHERE deleted_at IS NULL AND ativo;

CREATE SEQUENCE public.seq_numero_compra START 1;
CREATE TABLE public.compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero BIGINT NOT NULL DEFAULT nextval('public.seq_numero_compra'),
    fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
    data_compra DATE NOT NULL DEFAULT CURRENT_DATE,
    numero_documento TEXT,
    subtotal_produtos NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_produtos >= 0),
    valor_frete NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_frete >= 0),
    valor_taxa_cartao NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_taxa_cartao >= 0),
    outros_custos NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (outros_custos >= 0),
    custo_acessorio NUMERIC(14,2) GENERATED ALWAYS AS (valor_frete + valor_taxa_cartao + outros_custos) STORED,
    custo_total NUMERIC(14,2) GENERATED ALWAYS AS
      (subtotal_produtos + valor_frete + valor_taxa_cartao + outros_custos) STORED,
    criterio_rateio criterio_rateio_enum NOT NULL DEFAULT 'VALOR',
    status status_documento_enum NOT NULL DEFAULT 'RASCUNHO',
    data_confirmacao TIMESTAMPTZ, data_cancelamento TIMESTAMPTZ, motivo_cancelamento TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.usuarios(id),
    updated_by UUID REFERENCES public.usuarios(id),
    CONSTRAINT uq_compras_numero UNIQUE (numero),
    CONSTRAINT chk_compras_cancelamento CHECK (status <> 'CANCELADO'
      OR (data_cancelamento IS NOT NULL AND motivo_cancelamento IS NOT NULL)),
    CONSTRAINT chk_compras_confirmacao CHECK (status <> 'CONFIRMADO' OR data_confirmacao IS NOT NULL)
);
CREATE INDEX idx_compras_data ON public.compras (data_compra DESC);
CREATE INDEX idx_compras_fornecedor ON public.compras (fornecedor_id, data_compra DESC);
CREATE INDEX idx_compras_status ON public.compras (status);

CREATE TABLE public.compra_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id UUID NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
    valor_unitario NUMERIC(14,4) NOT NULL CHECK (valor_unitario >= 0),
    subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
    rateio_acessorio NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (rateio_acessorio >= 0),
    custo_total_item NUMERIC(14,2) GENERATED ALWAYS AS (subtotal + rateio_acessorio) STORED,
    custo_unitario_final NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (custo_unitario_final >= 0),
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_compra_itens_produto UNIQUE (compra_id, produto_id),
    CONSTRAINT chk_compra_itens_subtotal CHECK (subtotal = round(quantidade * valor_unitario, 2))
);
CREATE INDEX idx_compra_itens_compra ON public.compra_itens (compra_id);
CREATE INDEX idx_compra_itens_produto ON public.compra_itens (produto_id);

CREATE TABLE public.movimentacoes_estoque (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transacao_id UUID NOT NULL DEFAULT gen_random_uuid(),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    bucket bucket_estoque_enum NOT NULL,
    tipo tipo_movimento_enum NOT NULL,
    quantidade NUMERIC(14,3) NOT NULL CHECK (quantidade <> 0),
    custo_unitario NUMERIC(14,4) NOT NULL CHECK (custo_unitario >= 0),
    valor_total NUMERIC(14,2) NOT NULL,
    origem_tabela TEXT NOT NULL CHECK (origem_tabela IN
      ('compras','vendas','remessas','prestacoes_contas','ajustes','sistema')),
    origem_id UUID,
    data_movimento DATE NOT NULL DEFAULT CURRENT_DATE,
    estorno_de_id UUID REFERENCES public.movimentacoes_estoque(id) ON DELETE RESTRICT,
    motivo TEXT, observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.usuarios(id),
    CONSTRAINT chk_mov_ajuste_motivo CHECK (tipo NOT IN ('AJUSTE_POSITIVO','AJUSTE_NEGATIVO')
      OR (motivo IS NOT NULL AND length(trim(motivo)) >= 5)),
    CONSTRAINT chk_mov_valor CHECK (valor_total = round(quantidade * custo_unitario, 2))
);
CREATE INDEX idx_mov_produto_data ON public.movimentacoes_estoque (produto_id, data_movimento DESC);
CREATE INDEX idx_mov_transacao ON public.movimentacoes_estoque (transacao_id);
CREATE INDEX idx_mov_origem ON public.movimentacoes_estoque (origem_tabela, origem_id);
CREATE INDEX idx_mov_data ON public.movimentacoes_estoque (data_movimento DESC);
CREATE INDEX idx_mov_tipo ON public.movimentacoes_estoque (tipo, data_movimento DESC);
CREATE INDEX idx_mov_bucket ON public.movimentacoes_estoque (produto_id, bucket);
CREATE INDEX idx_mov_estorno ON public.movimentacoes_estoque (estorno_de_id);
