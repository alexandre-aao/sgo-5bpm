import { useState } from 'react';
import { UsersRound, UserPlus, Download } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';
import { TabelaUsuarios } from './TabelaUsuarios';
import { PainelArquivamento } from './PainelArquivamento';
import { ModalUsuario } from './ModalUsuario';
import { ModalResetSenha } from './ModalResetSenha';
import { useUsuariosCrud, type NovoUsuarioPayload, type UsuarioPublico } from './useUsuariosCrud';

function getLocalDateStr(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export default function UsuariosPage() {
  const { toast } = useToast();
  const { usuarios, criarUsuario, atualizarUsuario, resetarSenha, excluirUsuario } = useUsuariosCrud();
  const [modalAberto, setModalAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioPublico | null>(null);
  const [usuarioParaReset, setUsuarioParaReset] = useState<UsuarioPublico | null>(null);

  function handleNovoUsuario() {
    setUsuarioEditando(null);
    setModalAberto(true);
  }

  function handleEditar(usuario: UsuarioPublico) {
    setUsuarioEditando(usuario);
    setModalAberto(true);
  }

  async function handleExcluir(usuario: UsuarioPublico) {
    if (!window.confirm(`Excluir permanentemente o usuário "${usuario.usuario}"? Esta ação não pode ser desfeita.`)) return;
    const resultado = await excluirUsuario(usuario.usuario);
    if (resultado.ok) {
      toast('Usuário excluído.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  async function handleExportarBackup() {
    try {
      const res = await apiFetch('/api/backup');
      const dados = await res.json();
      if (!res.ok) {
        toast(dados.error || 'Falha ao gerar o backup.', 'danger');
        return;
      }
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sgo-backup-${getLocalDateStr()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast('Backup gerado e baixado.', 'success');
    } catch (erro) {
      console.error('Erro ao exportar backup:', erro);
      toast('Falha na comunicação com o servidor.', 'danger');
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <UsersRound />
            <h2>Usuários do Sistema</h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void handleExportarBackup()}>
              <Download /> Exportar Backup
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleNovoUsuario}>
              <UserPlus /> Novo Usuário
            </button>
          </div>
        </div>

        <TabelaUsuarios
          usuarios={usuarios} onEditar={handleEditar} onResetarSenha={setUsuarioParaReset} onExcluir={handleExcluir}
        />
      </div>

      {/* Manutenção do banco: fica em Administração, junto de Usuários, porque é
          P3-only e não pertence a nenhum módulo operacional. */}
      <PainelArquivamento />

      {modalAberto && (
        <ModalUsuario
          usuario={usuarioEditando}
          onFechar={() => setModalAberto(false)}
          onSalvar={(payload) =>
            usuarioEditando ? atualizarUsuario(usuarioEditando.usuario, payload) : criarUsuario(payload as NovoUsuarioPayload)
          }
        />
      )}

      {usuarioParaReset && (
        <ModalResetSenha usuario={usuarioParaReset} onFechar={() => setUsuarioParaReset(null)} onResetar={resetarSenha} />
      )}
    </>
  );
}
