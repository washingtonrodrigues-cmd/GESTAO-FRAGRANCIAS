CREATE SEQUENCE public.seq_numero_venda START 1;
CREATE TABLE public.vendas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero BIGINT NOT NULL DEFAULT nextval('public.seq_numero_venda'),
    tipo tipo_venda_enum NOT NULL,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE RESTRICT,
    revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE RESTRICT,
    data_venda DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    desconto_valor NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (desconto_valor >= 0),
    desconto_percentual NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (desconto_percentual BETWEEN 0 AND 100),
    valor_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
    custo_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (custo_total >= 0),
    lucro_bruto NUMERIC(14,2) GENERATED ALWAYS AS (valor_total - custo_total) STORED,
    forma_pagamento_id UUID NOT NULL REFERENCES public.formas_pagamento(id) ON DELETE RESTRICT,
    qtd_parcelas SMALLINT NOT NULL DEFAULT 1 CHECK (qtd_parcelas BETWEEN 1 AND 4),
    status status_documento_enum NOT NULL DEFAULT 'RASCUNHO',
    data_confirmacao TIMESTAMPTZ, data_cancelamento TIMESTAMPTZ, motivo_cancelamento TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.usuarios(id),
    updated_by UUID REFERENCES public.usuarios(id),
    CONSTRAINT uq_vendas_numero UNIQUE (numero),
    CONSTRAINT chk_vendas_destinatario CHECK (
        (tipo = 'CONSUMIDOR' AND revendedor_id IS NULL)
     OR (tipo = 'REVENDEDOR' AND revendedor_id IS NOT NULL AND cliente_id IS NULL)),
    CONSTRAINT chk_vendas_desconto CHECK (desconto_valor <= subtotal),
    CONSTRAINT chk_vendas_total CHECK (valor_total = subtotal - desconto_valor),
    CONSTRAINT chk_vendas_cancelamento CHECK (status <> 'CANCELADO'
      OR (data_cancelamento IS NOT NULL AND motivo_cancelamento IS NOT NULL))
);
CREATE INDEX idx_vendas_data ON public.vendas (data_venda DESC);
CREATE INDEX idx_vendas_cliente ON public.vendas (cliente_id, data_venda DESC);
CREATE INDEX idx_vendas_revendedor ON public.vendas (revendedor_id, data_venda DESC);
CREATE INDEX idx_vendas_tipo_status ON public.vendas (tipo, status, data_venda DESC);
CREATE INDEX idx_vendas_forma ON public.vendas (forma_pagamento_id);

CREATE TABLE public.venda_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(14,2) NOT NULL CHECK (preco_unitario >= 0),
    desconto_item NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (desconto_item >= 0),
    subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
    custo_unitario_praticado NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (custo_unitario_praticado >= 0),
    custo_total_item NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (custo_total_item >= 0),
    lucro_item NUMERIC(14,2) GENERATED ALWAYS AS (subtotal - custo_total_item) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_venda_itens_subtotal CHECK (subtotal = round(quantidade * preco_unitario, 2) - desconto_item)
);
CREATE INDEX idx_venda_itens_venda ON public.venda_itens (venda_id);
CREATE INDEX idx_venda_itens_produto ON public.venda_itens (produto_id);

CREATE SEQUENCE public.seq_numero_remessa START 1;
CREATE TABLE public.remessas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero BIGINT NOT NULL DEFAULT nextval('public.seq_numero_remessa'),
    revendedor_id UUID NOT NULL REFERENCES public.revendedores(id) ON DELETE RESTRICT,
    tipo tipo_remessa_enum NOT NULL DEFAULT 'MOSTRUARIO',
    data_envio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_prevista_acerto DATE, data_encerramento DATE,
    valor_custo_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_custo_total >= 0),
    valor_revenda_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_revenda_total >= 0),
    qtd_total_enviada NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_total_enviada >= 0),
    qtd_em_posse NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_em_posse >= 0),
    status status_documento_enum NOT NULL DEFAULT 'RASCUNHO',
    encerrada BOOLEAN NOT NULL DEFAULT false,
    data_cancelamento TIMESTAMPTZ, motivo_cancelamento TEXT, observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.usuarios(id),
    updated_by UUID REFERENCES public.usuarios(id),
    CONSTRAINT uq_remessas_numero UNIQUE (numero),
    CONSTRAINT chk_remessas_prazo CHECK (data_prevista_acerto IS NULL OR data_prevista_acerto >= data_envio),
    CONSTRAINT chk_remessas_encerramento CHECK (NOT encerrada OR qtd_em_posse = 0),
    CONSTRAINT chk_remessas_cancelamento CHECK (status <> 'CANCELADO'
      OR (data_cancelamento IS NOT NULL AND motivo_cancelamento IS NOT NULL))
);
CREATE INDEX idx_remessas_revendedor ON public.remessas (revendedor_id, data_envio DESC);
CREATE INDEX idx_remessas_abertas ON public.remessas (data_envio) WHERE status='CONFIRMADO' AND NOT encerrada;
CREATE INDEX idx_remessas_status ON public.remessas (status, tipo);

-- O CHECK do saldo NÃO pode ser DEFERRABLE (o Postgres não permite em CHECK).
-- A invariante é mantida porque: (a) uma trigger BEFORE INSERT já grava
-- qtd_em_posse = quantidade, e (b) a trigger de eventos atualiza os quatro
-- saldos numa ÚNICA instrução, sem estado intermediário inválido.
CREATE TABLE public.remessa_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remessa_id UUID NOT NULL REFERENCES public.remessas(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
    valor_custo_unitario NUMERIC(14,4) NOT NULL CHECK (valor_custo_unitario >= 0),
    valor_revenda_unitario NUMERIC(14,2) NOT NULL CHECK (valor_revenda_unitario >= 0),
    qtd_em_posse NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_em_posse >= 0),
    qtd_vendida NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_vendida >= 0),
    qtd_devolvida NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_devolvida >= 0),
    qtd_perdida NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_perdida >= 0),
    data_ultima_devolucao DATE, observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_remessa_itens_produto UNIQUE (remessa_id, produto_id),
    CONSTRAINT chk_remessa_itens_saldo
      CHECK (qtd_em_posse + qtd_vendida + qtd_devolvida + qtd_perdida = quantidade)
);
CREATE INDEX idx_remessa_itens_remessa ON public.remessa_itens (remessa_id);
CREATE INDEX idx_remessa_itens_produto ON public.remessa_itens (produto_id);
CREATE INDEX idx_remessa_itens_em_posse ON public.remessa_itens (produto_id) WHERE qtd_em_posse > 0;

CREATE TABLE public.prestacoes_contas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero BIGINT GENERATED BY DEFAULT AS IDENTITY,
    revendedor_id UUID NOT NULL REFERENCES public.revendedores(id) ON DELETE RESTRICT,
    data_acerto DATE NOT NULL DEFAULT CURRENT_DATE,
    qtd_vendida NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_vendida >= 0),
    qtd_devolvida NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_devolvida >= 0),
    qtd_perdida NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qtd_perdida >= 0),
    valor_vendido NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_vendido >= 0),
    custo_vendido NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (custo_vendido >= 0),
    valor_devolvido NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_devolvido >= 0),
    valor_perdas NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_perdas >= 0),
    cobrar_perdas BOOLEAN NOT NULL DEFAULT true,
    valor_devido NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_devido >= 0),
    lucro_bruto NUMERIC(14,2) GENERATED ALWAYS AS (valor_vendido - custo_vendido) STORED,
    qtd_parcelas SMALLINT NOT NULL DEFAULT 1 CHECK (qtd_parcelas BETWEEN 1 AND 4),
    forma_pagamento_id UUID REFERENCES public.formas_pagamento(id) ON DELETE RESTRICT,
    status status_documento_enum NOT NULL DEFAULT 'RASCUNHO',
    data_confirmacao TIMESTAMPTZ, data_cancelamento TIMESTAMPTZ,
    motivo_cancelamento TEXT, observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.usuarios(id),
    updated_by UUID REFERENCES public.usuarios(id),
    CONSTRAINT uq_prestacoes_numero UNIQUE (numero),
    CONSTRAINT chk_prestacoes_cancelamento CHECK (status <> 'CANCELADO'
      OR (data_cancelamento IS NOT NULL AND motivo_cancelamento IS NOT NULL))
);
CREATE INDEX idx_prestacoes_revendedor ON public.prestacoes_contas (revendedor_id, data_acerto DESC);
CREATE INDEX idx_prestacoes_data ON public.prestacoes_contas (data_acerto DESC);
CREATE INDEX idx_prestacoes_forma ON public.prestacoes_contas (forma_pagamento_id);

CREATE TABLE public.remessa_item_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remessa_item_id UUID NOT NULL REFERENCES public.remessa_itens(id) ON DELETE CASCADE,
    prestacao_id UUID REFERENCES public.prestacoes_contas(id) ON DELETE RESTRICT,
    status_novo status_item_remessa_enum NOT NULL CHECK (status_novo <> 'EM_POSSE'),
    quantidade NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
    valor_unitario NUMERIC(14,2) NOT NULL CHECK (valor_unitario >= 0),
    valor_total NUMERIC(14,2) NOT NULL CHECK (valor_total >= 0),
    custo_unitario NUMERIC(14,4) NOT NULL CHECK (custo_unitario >= 0),
    data_evento DATE NOT NULL DEFAULT CURRENT_DATE,
    motivo TEXT, observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.usuarios(id),
    CONSTRAINT chk_evento_perdido_motivo CHECK (status_novo <> 'PERDIDO' OR motivo IS NOT NULL)
);
CREATE INDEX idx_eventos_item ON public.remessa_item_eventos (remessa_item_id);
CREATE INDEX idx_eventos_prestacao ON public.remessa_item_eventos (prestacao_id);
CREATE INDEX idx_eventos_data ON public.remessa_item_eventos (data_evento DESC, status_novo);
