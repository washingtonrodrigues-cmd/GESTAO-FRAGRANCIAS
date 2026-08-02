CREATE OR REPLACE FUNCTION public.trg_fn_atualiza_titulo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t UUID := COALESCE(NEW.titulo_id, OLD.titulo_id);
        v_rec NUMERIC(14,2); v_orig NUMERIC(14,2); v_sit situacao_titulo_enum;
BEGIN
  SELECT COALESCE(SUM(valor),0) INTO v_rec FROM public.recebimento_alocacoes
   WHERE titulo_id=v_t AND NOT estornada;
  SELECT valor_original, situacao INTO v_orig, v_sit FROM public.titulos_receber WHERE id=v_t;

  UPDATE public.titulos_receber SET
    valor_recebido = v_rec,
    situacao = CASE WHEN v_sit='CANCELADO' THEN 'CANCELADO'::situacao_titulo_enum
                    WHEN v_rec >= v_orig THEN 'PAGO'::situacao_titulo_enum
                    ELSE 'ABERTO'::situacao_titulo_enum END,
    data_quitacao = CASE WHEN v_sit='CANCELADO' THEN NULL
                         WHEN v_rec >= v_orig THEN COALESCE(data_quitacao, CURRENT_DATE)
                         ELSE NULL END,
    updated_at = now()
  WHERE id=v_t;

  UPDATE public.recebimentos r SET valor_alocado =
    COALESCE((SELECT SUM(valor) FROM public.recebimento_alocacoes
               WHERE recebimento_id=r.id AND NOT estornada),0)
  WHERE r.id = COALESCE(NEW.recebimento_id, OLD.recebimento_id);
  RETURN COALESCE(NEW, OLD);
END; $$;
