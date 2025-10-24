
import { NextResponse } from 'next/server';
import { consultarProdutos } from '@/lib/produtos-service';
import { cacheService } from '@/lib/cache-service';

export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validação
    if (query.length < 2) {
      return NextResponse.json(
        { produtos: [], total: 0 },
        { 
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
          }
        }
      );
    }

    // Verificar cache
    const cacheKey = `search:produtos:${query}:${limit}`;
    const cached = cacheService.get<any>(cacheKey);
    
    if (cached !== null) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, max-age=180',
        },
      });
    }

    // Buscar produtos (somente dados básicos, sem estoque/preço)
    const resultado = await consultarProdutos(1, limit, query, '');
    
    // Salvar no cache (3 minutos)
    cacheService.set(cacheKey, resultado, 3 * 60 * 1000);

    return NextResponse.json(resultado, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=180',
      },
    });
  } catch (error: any) {
    console.error('Erro na busca rápida:', error);
    return NextResponse.json(
      { error: error.message || 'Erro na busca' },
      { status: 500 }
    );
  }
}
