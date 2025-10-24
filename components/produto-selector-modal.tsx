
"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { EstoqueModal } from "@/components/estoque-modal"

interface ProdutoSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (produto: any, preco: number) => void
  titulo?: string
}

export function ProdutoSelectorModal({ isOpen, onClose, onConfirm, titulo = "Buscar Produto" }: ProdutoSelectorModalProps) {
  const [produtos, setProdutos] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)
  const [produtoSelecionado, setProdutoSelecionado] = useState<any | null>(null)
  const [showEstoqueModal, setShowEstoqueModal] = useState(false)

  const buscarProdutos = async (search: string) => {
    if (search.length < 2) {
      setProdutos([])
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/sankhya/produtos/search?q=${encodeURIComponent(search)}&limit=20`)
      const data = await response.json()

      if (data.produtos && data.produtos.length > 0) {
        setProdutos(data.produtos)
      } else {
        setProdutos([])
      }
    } catch (error) {
      console.error('Erro ao buscar produtos:', error)
      setProdutos([])
    } finally {
      setIsLoading(false)
    }
  }

  const buscarProdutosComDebounce = (search: string) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout)
    }

    if (search.length < 2) {
      setProdutos([])
      return
    }

    const timeout = setTimeout(() => {
      buscarProdutos(search)
    }, 500)

    setSearchTimeout(timeout)
  }

  const handleSelecionarProduto = (produto: any) => {
    setProdutoSelecionado(produto)
    setShowEstoqueModal(true)
    // Não fechar o modal, apenas aguardar retorno do EstoqueModal
  }

  const handleConfirmarEstoque = (produto: any, preco: number) => {
    setShowEstoqueModal(false)
    setProdutoSelecionado(null)
    onConfirm(produto, preco)
    setProdutos([])
    // Fechar o modal de produto após confirmar
    onClose()
  }
  
  const handleCancelarEstoque = () => {
    setShowEstoqueModal(false)
    setProdutoSelecionado(null)
    // Modal de produto continua aberto para nova seleção
  }

  useEffect(() => {
    if (!isOpen) {
      setProdutos([])
      setProdutoSelecionado(null)
    }
  }, [isOpen])

  return (
    <>
      <Dialog open={isOpen && !showEstoqueModal} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh]" data-produto-selector style={{ zIndex: 50 }}>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Digite pelo menos 2 caracteres para buscar..."
              onChange={(e) => buscarProdutosComDebounce(e.target.value)}
              className="text-sm"
              autoFocus
            />
            <div className="max-h-96 overflow-y-auto space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Buscando produtos...</span>
                </div>
              ) : produtos.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Digite pelo menos 2 caracteres para buscar produtos
                </div>
              ) : (
                produtos.map((produto) => (
                  <Card
                    key={produto.CODPROD}
                    className="cursor-pointer hover:bg-green-50 transition-colors"
                    onClick={() => handleSelecionarProduto(produto)}
                  >
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{produto.DESCRPROD}</p>
                          <p className="text-xs text-muted-foreground">Cód: {produto.CODPROD}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showEstoqueModal && (
        <EstoqueModal
          isOpen={showEstoqueModal}
          onClose={handleCancelarEstoque}
          product={produtoSelecionado}
          onConfirm={handleConfirmarEstoque}
        />
      )}
    </>
  )
}
