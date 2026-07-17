import { useState } from "react";

import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";

import { useClientesData } from "@/contexts/ClientesContext";
import {
  baixarModeloImportacao,
  importarClientes,
} from "@/features/funil/services/clientesService";

export function ImportarDialog({ open, onClose }) {
  const { reload } = useClientesData();
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  function fechar() {
    setArquivo(null);
    setResultado(null);
    setErro("");
    onClose();
  }

  async function handleImportar() {
    if (!arquivo) return;
    setEnviando(true);
    setErro("");
    setResultado(null);
    try {
      const res = await importarClientes(arquivo);
      setResultado(res);
      if (res.criados > 0) await reload();
    } catch (e) {
      setErro(e.response?.data?.erro || "Falha ao importar a planilha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onClose={fechar} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        Importar clientes de Excel
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Envie um arquivo .xlsx. A primeira linha deve conter os cabeçalhos das colunas.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadRoundedIcon />}
          onClick={baixarModeloImportacao}
          sx={{ mb: 2 }}
        >
          Baixar modelo (.xlsx)
        </Button>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Colunas reconhecidas: <b>Funil</b>, <b>Nome / Empresa</b> (obrigatória), Etapa,
          Consultor, Telefone, Email, CNPJ, Segmento, Município, Estado, Produto atual,
          Motivo distrato, Valor contrato, Meses contrato, Notas.
        </Typography>

        <Button component="label" variant="contained" startIcon={<UploadFileRoundedIcon />}>
          {arquivo ? "Trocar arquivo" : "Escolher arquivo"}
          <input
            type="file"
            hidden
            accept=".xlsx"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] || null);
              setResultado(null);
              setErro("");
            }}
          />
        </Button>
        {arquivo && (
          <Typography variant="caption" sx={{ ml: 1.5 }}>
            {arquivo.name}
          </Typography>
        )}

        {erro && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erro}
          </Alert>
        )}

        {resultado && (
          <Box sx={{ mt: 2 }}>
            <Alert severity={resultado.erros.length ? "warning" : "success"}>
              {resultado.criados} cliente(s) importado(s).
              {resultado.erros.length > 0 && ` ${resultado.erros.length} linha(s) com erro.`}
            </Alert>
            {resultado.erros.length > 0 && (
              <List dense sx={{ maxHeight: 180, overflow: "auto", mt: 1 }}>
                {resultado.erros.map((e) => (
                  <ListItem key={e.linha} disableGutters>
                    <ListItemText
                      primary={`Linha ${e.linha}: ${e.erro}`}
                      primaryTypographyProps={{ variant: "caption", color: "text.secondary" }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={fechar}>
          {resultado ? "Fechar" : "Cancelar"}
        </Button>
        <Button onClick={handleImportar} disabled={!arquivo || enviando}>
          {enviando ? "Importando..." : "Importar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
