"use client"

import { useState, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, Search } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"

interface Titulo {
  nroTitulo: string
  parceiro: string
  codParceiro: string
  valor: number
  dataVencimento: string
  dataNegociacao: string
  status: "Aberto" | "Baixado"
  tipoFinanceiro: "Real" | "Provisão"
  tipoTitulo: string
  contaBancaria?: string
  historico?: string
  numeroParcela: number
  origemFinanceiro: string
  codigoEmpresa: number
  codigoNatureza: number
  boleto: {
    codigoBarras: string | null
    nossoNumero: string | null
    linhaDigitavel: string | null
    numeroRemessa: string | null
  }
}

interface Pagination {
  page: string
  offset: string
  total: string
  hasMore: string
}

interface Partner {
  CODPARC: string
  NOMEPARC: string
  CGC_CPF: string
}

export default function TitulosReceberTable() {
  const [titulos, setTitulos] = useState<Titulo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTitulo, setSelectedTitulo] = useState<Titulo | null>(null)
  const [showDetalhes, setShowDetalhes] = useState(false)
  const [pagination, setPagination] = useState<Pagination>({
    page: "1",
    offset: "0",
    total: "0",
    hasMore: "false"
  })
  const [currentPage, setCurrentPage] = useState(1)
  
  // Filtros obrigatórios
  const [parceiros, setParceiros] = useState<Partner[]>([])
  const [parceiroSelecionado, setParceiroSelecionado] = useState<string>("")
  const [dataNegociacaoInicio, setDataNegociacaoInicio] = useState<string>("")
  const [dataNegociacaoFim, setDataNegociacaoFim] = useState<string>("")
  const [statusFinanceiro, setStatusFinanceiro] = useState<string>("") // Real ou Provisão
  const [partnerSearch, setPartnerSearch] = useState("")
  const [isLoadingPartners, setIsLoadingPartners] = useState(false)

  const carregarTitulos = async () => {
    // Validar filtros obrigatórios
    if (!parceiroSelecionado) {
      toast.error('Selecione um parceiro antes de buscar os títulos')
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({
        pagina: currentPage.toString(),
        codigoEmpresa: '1',
        codigoParceiro: parceiroSelecionado
      })

      // Adicionar data de negociação se preenchidas
      if (dataNegociacaoInicio) {
        params.append('dataNegociacaoInicio', dataNegociacaoInicio)
      }
      if (dataNegociacaoFim) {
        params.append('dataNegociacaoFinal', dataNegociacaoFim)
      }

      // Status Financeiro: Real ou Provisão (1=Real, 2=Provisão, 3=Todos)
      if (statusFinanceiro) {
        params.append('statusFinanceiro', statusFinanceiro)
      } else {
        params.append('statusFinanceiro', '3') // Padrão: Todos
      }

      // Tipo Financeiro: Sempre buscar apenas Pendentes (Abertos)
      params.append('tipoFinanceiro', '1') // 1=Pendente (Aberto)

      const response = await fetch(`/api/sankhya/titulos-receber?${params.toString()}`)

      if (!response.ok) throw new Error('Erro ao carregar títulos')

      const data = await response.json()
      
      // Ordenar títulos por nroTitulo em ordem decrescente
      const titulosOrdenados = (data.titulos || []).sort((a: Titulo, b: Titulo) => {
        return parseInt(b.nroTitulo) - parseInt(a.nroTitulo)
      })
      
      setTitulos(titulosOrdenados)
      setPagination(data.pagination || {
        page: "1",
        offset: "0",
        total: "0",
        hasMore: "false"
      })
      
      toast.success(`${titulosOrdenados.length} título(s) encontrado(s)`)
    } catch (error) {
      console.error('Erro ao carregar títulos:', error)
      toast.error('Erro ao carregar títulos a receber')
      setTitulos([])
    } finally {
      setLoading(false)
    }
  }

  const loadPartners = async (searchTerm: string = '') => {
    setIsLoadingPartners(true)
    try {
      const searchParam = searchTerm 
        ? `searchName=${encodeURIComponent(searchTerm)}`
        : ''

      const url = `/api/sankhya/parceiros?page=1&pageSize=50${searchParam ? '&' + searchParam : ''}`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Falha ao carregar parceiros')
      const data = await response.json()
      setParceiros(data.parceiros || [])
    } catch (error: any) {
      console.error('❌ Erro ao carregar parceiros:', error)
      setParceiros([])
    } finally {
      setIsLoadingPartners(false)
    }
  }

  const handlePartnerSearch = (value: string) => {
    setPartnerSearch(value)
    if (value.length >= 2) {
      loadPartners(value)
    } else if (value.length === 0) {
      loadPartners()
    }
  }

  useEffect(() => {
    // Não carregar títulos automaticamente
    setTitulos([])
  }, [currentPage])

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", className: string }> = {
      Aberto: { variant: "outline", className: "bg-yellow-50 text-yellow-700 border-yellow-300" },
      Baixado: { variant: "default", className: "bg-green-50 text-green-700 border-green-300" }
    }
    return variants[status] || variants.Aberto
  }

  const baixarBoleto = async (titulo: Titulo) => {
    if (titulo.tipoTitulo !== "Boleto") {
      toast.error("Este título não é um boleto")
      return
    }

    if (titulo.status === "Baixado") {
      toast.error("Este título já foi baixado")
      return
    }

    try {
      toast.info("Preparando download do boleto...")
      const response = await fetch(`/api/sankhya/boleto/${titulo.nroTitulo}`)

      if (!response.ok) throw new Error('Erro ao baixar boleto')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `boleto_${titulo.nroTitulo}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success("Boleto baixado com sucesso!")
    } catch (error) {
      console.error('Erro ao baixar boleto:', error)
      toast.error('Erro ao baixar boleto. Tente novamente.')
    }
  }

  const abrirDetalhes = (titulo: Titulo) => {
    setSelectedTitulo(titulo)
    setShowDetalhes(true)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white border rounded-lg p-3 md:p-4 space-y-3 md:space-y-4">
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Filtros de Busca</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {/* Parceiro */}
          <div className="space-y-1.5 md:space-y-2">
            <Label htmlFor="parceiro" className="text-xs md:text-sm font-medium">Parceiro *</Label>
            <Select
              value={parceiroSelecionado}
              onValueChange={(value) => {
                setParceiroSelecionado(value)
                const parceiro = parceiros.find(p => p.CODPARC === value)
                if (parceiro) {
                  setPartnerSearch(parceiro.NOMEPARC)
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um parceiro" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar parceiro..."
                      value={partnerSearch}
                      onChange={(e) => handlePartnerSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                {isLoadingPartners ? (
                  <SelectItem value="loading" disabled>Carregando...</SelectItem>
                ) : parceiros.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    {partnerSearch ? "Nenhum parceiro encontrado" : "Digite para buscar"}
                  </SelectItem>
                ) : (
                  parceiros.map((partner) => (
                    <SelectItem key={partner.CODPARC} value={partner.CODPARC}>
                      <div className="truncate max-w-[300px]">
                        {partner.NOMEPARC} - {partner.CGC_CPF}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Data de Negociação Início */}
          <div className="space-y-1.5 md:space-y-2">
            <Label htmlFor="dataNegociacaoInicio" className="text-xs md:text-sm font-medium">Data Negociação (Início)</Label>
            <Input
              id="dataNegociacaoInicio"
              type="date"
              value={dataNegociacaoInicio}
              onChange={(e) => setDataNegociacaoInicio(e.target.value)}
              className="h-9 md:h-10 text-sm"
            />
          </div>

          {/* Data de Negociação Fim */}
          <div className="space-y-1.5 md:space-y-2">
            <Label htmlFor="dataNegociacaoFim" className="text-xs md:text-sm font-medium">Data Negociação (Fim)</Label>
            <Input
              id="dataNegociacaoFim"
              type="date"
              value={dataNegociacaoFim}
              onChange={(e) => setDataNegociacaoFim(e.target.value)}
              className="h-9 md:h-10 text-sm"
            />
          </div>

          {/* Tipo: Real ou Provisão */}
          <div className="space-y-1.5 md:space-y-2">
            <Label htmlFor="statusFinanceiro" className="text-xs md:text-sm font-medium">Tipo</Label>
            <Select
              value={statusFinanceiro}
              onValueChange={setStatusFinanceiro}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Todos</SelectItem>
                <SelectItem value="1">Real</SelectItem>
                <SelectItem value="2">Provisão</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Botão de Buscar */}
          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm font-medium opacity-0 hidden md:block">Ação</Label>
            <Button 
              onClick={carregarTitulos}
              disabled={!parceiroSelecionado || loading}
              className="w-full h-9 md:h-10 text-sm"
            >
              <Search className="w-4 h-4 mr-2" />
              {loading ? 'Buscando...' : 'Buscar Títulos'}
            </Button>
          </div>
        </div>
      </div>

      {/* Informações sobre os resultados */}
      {titulos.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <span className="font-semibold">Exibindo:</span>
            <Badge variant="outline" className="bg-white">
              {titulos.filter(t => t.tipoFinanceiro === "Real").length} Real
            </Badge>
            <Badge variant="outline" className="bg-white">
              {titulos.filter(t => t.tipoFinanceiro === "Provisão").length} Provisão
            </Badge>
            <span>•</span>
            <Badge variant="outline" className="bg-white">
              {titulos.filter(t => t.status === "Aberto").length} Aberto
            </Badge>
            <Badge variant="outline" className="bg-white">
              {titulos.filter(t => t.status === "Baixado").length} Baixado
            </Badge>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-y-auto max-h-[600px]">
          <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Nro Título</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead className="text-right">Valor (R$)</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Carregando títulos...
                </TableCell>
              </TableRow>
            ) : titulos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  {!parceiroSelecionado 
                    ? "Selecione um parceiro para buscar os títulos" 
                    : "Nenhum título encontrado para os filtros selecionados"}
                </TableCell>
              </TableRow>
            ) : (
              titulos.map((titulo) => (
                <TableRow 
                  key={titulo.nroTitulo}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => abrirDetalhes(titulo)}
                >
                  <TableCell className="font-medium">{titulo.nroTitulo}</TableCell>
                  <TableCell>{titulo.parceiro}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {titulo.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </TableCell>
                  <TableCell>
                    {titulo.dataVencimento ? (() => {
                      try {
                        const date = new Date(titulo.dataVencimento);
                        return isNaN(date.getTime()) ? titulo.dataVencimento : format(date, "dd/MM/yyyy");
                      } catch {
                        return titulo.dataVencimento;
                      }
                    })() : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={
                        titulo.tipoFinanceiro === "Provisão" 
                          ? "bg-purple-50 text-purple-700 border-purple-300" 
                          : "bg-blue-50 text-blue-700 border-blue-300"
                      }
                    >
                      {titulo.tipoFinanceiro}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadge(titulo.status).variant} className={getStatusBadge(titulo.status).className}>
                      {titulo.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Paginação */}
      {pagination && parseInt(pagination.total) > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t rounded-b-lg">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Total de registros: <strong>{pagination.total}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            <span className="text-sm text-gray-600">
              Página {currentPage}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={pagination.hasMore === "false"}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Detalhes do Título</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Informações completas sobre o título selecionado
            </DialogDescription>
          </DialogHeader>

          {selectedTitulo && (
            <div className="space-y-6">
              {/* Seção: Identificação */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Identificação</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Número do Título</label>
                    <p className="text-lg font-bold text-gray-900">{selectedTitulo.nroTitulo}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Tipo de Título</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedTitulo.tipoTitulo}</p>
                  </div>
                </div>
              </div>

              {/* Seção: Status e Classificação */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Status e Classificação</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Status</label>
                    <div className="mt-1">
                      <Badge 
                        variant={getStatusBadge(selectedTitulo.status).variant} 
                        className={`${getStatusBadge(selectedTitulo.status).className} text-sm py-1 px-3`}
                      >
                        {selectedTitulo.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Tipo Financeiro</label>
                    <div className="mt-1">
                      <Badge 
                        variant="outline" 
                        className={`${selectedTitulo.tipoFinanceiro === "Real" ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-purple-50 text-purple-700 border-purple-300"} text-sm py-1 px-3`}
                      >
                        {selectedTitulo.tipoFinanceiro}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção: Parceiro */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Parceiro</h3>
                <div className="space-y-1">
                  <p className="text-lg font-bold text-gray-900">{selectedTitulo.parceiro}</p>
                  <p className="text-sm text-muted-foreground">Código: {selectedTitulo.codParceiro}</p>
                </div>
              </div>

              {/* Seção: Valores e Datas */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Valores e Datas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Valor do Título</label>
                    <p className="text-3xl font-bold text-green-600">
                      {selectedTitulo.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase">Data de Vencimento</label>
                      <p className="text-base font-semibold text-gray-900">
                        {selectedTitulo.dataVencimento ? (() => {
                          try {
                            const date = new Date(selectedTitulo.dataVencimento);
                            return isNaN(date.getTime()) ? selectedTitulo.dataVencimento : format(date, "dd/MM/yyyy");
                          } catch {
                            return selectedTitulo.dataVencimento;
                          }
                        })() : '-'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase">Data de Negociação</label>
                      <p className="text-base font-semibold text-gray-900">
                        {selectedTitulo.dataNegociacao ? (() => {
                          try {
                            const date = new Date(selectedTitulo.dataNegociacao);
                            return isNaN(date.getTime()) ? selectedTitulo.dataNegociacao : format(date, "dd/MM/yyyy");
                          } catch {
                            return selectedTitulo.dataNegociacao;
                          }
                        })() : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção: Informações Bancárias */}
              {selectedTitulo.contaBancaria && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Informações Bancárias</h3>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Conta Bancária</label>
                    <p className="text-base font-semibold text-gray-900">{selectedTitulo.contaBancaria}</p>
                  </div>
                </div>
              )}

              {/* Seção: Histórico */}
              {selectedTitulo.historico && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Histórico</h3>
                  <p className="text-base text-gray-900">{selectedTitulo.historico}</p>
                </div>
              )}

              {/* Seção: Informações do Boleto */}
              {selectedTitulo.boleto.nossoNumero && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-300">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3 uppercase tracking-wide flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Informações do Boleto
                  </h3>

                  <div className="space-y-3">
                    {selectedTitulo.boleto.nossoNumero && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-blue-700 uppercase tracking-wide">Nosso Número</label>
                        <p className="text-sm font-mono bg-white p-2 rounded border border-blue-200">{selectedTitulo.boleto.nossoNumero}</p>
                      </div>
                    )}

                    {selectedTitulo.boleto.linhaDigitavel && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-blue-700 uppercase tracking-wide">Linha Digitável</label>
                        <p className="text-sm font-mono bg-white p-2 rounded border border-blue-200 break-all">{selectedTitulo.boleto.linhaDigitavel}</p>
                      </div>
                    )}

                    {selectedTitulo.boleto.codigoBarras && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-blue-700 uppercase tracking-wide">Código de Barras</label>
                        <p className="text-sm font-mono bg-white p-2 rounded border border-blue-200 break-all">{selectedTitulo.boleto.codigoBarras}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Botão de Ação */}
              {selectedTitulo.tipoTitulo === "Boleto" && selectedTitulo.status !== "Baixado" && (
                <Button 
                  onClick={() => baixarBoleto(selectedTitulo)} 
                  className="w-full py-6 text-base font-semibold"
                  size="lg"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Baixar Boleto em PDF
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}