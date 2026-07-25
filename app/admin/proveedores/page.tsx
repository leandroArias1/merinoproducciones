import { prisma } from '@/lib/db'
import { listProvidersWithStats } from '@/lib/finance/party'
import { PartyDirectory, type PartyFiltro } from '@/components/finance/party-directory'

const FILTROS: PartyFiltro[] = ['todos', 'deuda', 'aldia']

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>
}) {
  const sp = await searchParams
  const filtro = FILTROS.includes(sp.estado as PartyFiltro) ? (sp.estado as PartyFiltro) : 'todos'
  const rows = await listProvidersWithStats(prisma)

  return <PartyDirectory rows={rows} kind="PROVIDER" q={sp.q ?? ''} filtro={filtro} />
}
