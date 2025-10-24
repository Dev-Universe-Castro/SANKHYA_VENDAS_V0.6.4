
import { NextResponse } from 'next/server';
import { buscarPrecoProduto, consultarEstoqueProduto } from '@/lib/produtos-service';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { codigos } = await request.json();

    if (!codigos || !Array.isArray(codigos)) {
      return NextResponse.json(
        { error: 'Códigos de produtos são obrigatórios' },
        { status: 400 }
      );
    }

    // Processar em lote com limite
    const limit = Math.min(codigos.length, 10);
    const results: any = {};

    for (let i = 0; i < limit; i++) {
      const codProd = codigos[i];
      
      try {
        // Buscar em paralelo preço e estoque (cache ajuda aqui)
        const [preco, estoque] = await Promise.all([
          buscarPrecoProduto(codProd, 0, true),
          consultarEstoqueProduto(codProd, '', true)
        ]);

        results[codProd] = {
          preco: preco || 0,
          estoque: estoque.estoqueTotal || 0
        };

        // Pequeno delay entre produtos
        if (i < limit - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        results[codProd] = {
          preco: 0,
          estoque: 0,
          error: true
        };
      }
    }

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 minutos
      },
    });
  } catch (error: any) {
    console.error('Erro ao buscar informações em lote:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar informações' },
      { status: 500 }
    );
  }
}
