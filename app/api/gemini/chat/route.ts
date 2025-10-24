
import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cookies } from 'next/headers';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Função helper para fetch com timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// Função para buscar dados do sistema (otimizada)
async function analisarDadosDoSistema(userId: number, userName: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';
    console.log('🔍 Iniciando busca de dados do sistema...');
    
    // Buscar dados em paralelo com timeout de 5 segundos cada
    const [leadsData, parceirosData, produtosData, pedidosData] = await Promise.allSettled([
      fetchWithTimeout(`${baseUrl}/api/leads`, {
        headers: { 'Cookie': `user=${JSON.stringify({ id: userId })}` }
      }, 5000).then(r => r.ok ? r.json() : []),
      
      fetchWithTimeout(`${baseUrl}/api/sankhya/parceiros?page=1&pageSize=20`, {}, 5000)
        .then(r => r.ok ? r.json() : { parceiros: [] }),
      
      fetchWithTimeout(`${baseUrl}/api/sankhya/produtos?page=1&pageSize=30`, {}, 5000)
        .then(r => r.ok ? r.json() : { produtos: [] }),
      
      fetchWithTimeout(`${baseUrl}/api/sankhya/pedidos/listar?userId=${userId}`, {}, 5000)
        .then(r => r.ok ? r.json() : [])
    ]);

    const leads = leadsData.status === 'fulfilled' ? (Array.isArray(leadsData.value) ? leadsData.value : []) : [];
    const parceiros = parceirosData.status === 'fulfilled' ? (Array.isArray(parceirosData.value.parceiros) ? parceirosData.value.parceiros : []) : [];
    const produtos = produtosData.status === 'fulfilled' ? (Array.isArray(produtosData.value.produtos) ? produtosData.value.produtos : []) : [];
    const pedidos = pedidosData.status === 'fulfilled' ? (Array.isArray(pedidosData.value) ? pedidosData.value : []) : [];

    console.log(`✅ Dados carregados: ${leads.length} leads, ${parceiros.length} parceiros, ${produtos.length} produtos, ${pedidos.length} pedidos`);

    return {
      userName,
      leads: leads.slice(0, 15),
      parceiros: parceiros.slice(0, 15),
      produtos: produtos.slice(0, 20),
      pedidos: pedidos.slice(0, 10),
      totalLeads: leads.length,
      totalParceiros: parceirosData.status === 'fulfilled' ? (parceirosData.value.total || parceiros.length) : 0,
      totalProdutos: produtosData.status === 'fulfilled' ? (produtosData.value.total || produtos.length) : 0,
      totalPedidos: pedidos.length
    };
  } catch (error) {
    console.error('Erro ao analisar dados:', error);
    return null;
  }
}

const SYSTEM_PROMPT = `Você é um Assistente de Vendas Inteligente integrado em uma ferramenta de CRM/Força de Vendas chamada Sankhya CRM.

SEU PAPEL E RESPONSABILIDADES:
- Ajudar vendedores a identificar oportunidades de vendas
- Sugerir ações estratégicas para fechar negócios
- Analisar leads e recomendar próximos passos
- Identificar clientes potenciais com maior chance de conversão
- Sugerir produtos que podem interessar aos clientes
- Alertar sobre leads em risco ou oportunidades urgentes

DADOS QUE VOCÊ TEM ACESSO:
- Leads: oportunidades de vendas com informações sobre valor, estágio, parceiro associado
- Parceiros: clientes e prospects cadastrados no sistema
- Produtos: catálogo REAL de produtos com estoque atual (USE APENAS OS PRODUTOS FORNECIDOS NO CONTEXTO)
- Atividades: histórico de interações com leads

⚠️ REGRA IMPORTANTE SOBRE PRODUTOS:
Você receberá uma lista completa de produtos com suas quantidades em estoque.
NUNCA mencione produtos que não estejam explicitamente listados nos dados fornecidos.
Se não houver produtos na lista, informe que não há produtos cadastrados no momento.

COMO VOCÊ DEVE AGIR:
1. Sempre analise os dados fornecidos antes de responder
2. Seja proativo em sugerir vendas e ações comerciais
3. Identifique padrões e oportunidades nos dados
4. Use métricas e números concretos em suas análises
5. Seja direto e focado em resultados de vendas
6. Priorize leads com maior valor e urgência
7. Sugira próximos passos claros e acionáveis

FORMATO DAS RESPOSTAS:
- Use emojis para destacar informações importantes (📊 💰 🎯 ⚠️ ✅)
- Organize informações em listas quando relevante
- Destaque valores monetários e datas importantes
- Seja conciso mas informativo

Sempre que o usuário fizer uma pergunta, considere os dados do sistema disponíveis para dar respostas contextualizadas e acionáveis.`;

export async function POST(request: NextRequest) {
  try {
    const { message, history } = await request.json();

    // Obter usuário autenticado
    const cookieStore = await cookies();
    const userCookie = cookieStore.get('user');
    let userId = 0;
    let userName = 'Usuário';
    
    if (userCookie) {
      try {
        const user = JSON.parse(userCookie.value);
        userId = user.id;
        userName = user.name || 'Usuário';
      } catch (e) {
        console.error('Erro ao parsear cookie:', e);
      }
    }

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
      }
    });

    // Montar histórico com prompt de sistema
    const chatHistory = [
      {
        role: 'user',
        parts: [{ text: SYSTEM_PROMPT }],
      },
      {
        role: 'model',
        parts: [{ text: 'Entendido! Sou seu Assistente de Vendas no Sankhya CRM. Estou pronto para analisar seus dados e ajudar você a vender mais. Como posso ajudar?' }],
      },
      ...history.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }))
    ];

    // Adicionar contexto de dados APENAS no primeiro prompt do usuário
    let messageWithContext = message;
    if (history.length === 0) {
      console.log('🔍 Primeiro prompt detectado - Buscando dados do sistema...');
      const dadosSistema = await analisarDadosDoSistema(userId, userName);
      
      if (dadosSistema) {
        messageWithContext = `DADOS DO SISTEMA (para contexto da sua análise):

👤 USUÁRIO LOGADO: ${dadosSistema.userName}

📊 RESUMO GERAL:
- Total de Leads Ativos: ${dadosSistema.totalLeads}
- Total de Parceiros/Clientes: ${dadosSistema.totalParceiros}
- Total de Produtos: ${dadosSistema.totalProdutos}
- Total de Pedidos: ${dadosSistema.totalPedidos}
- Total de Atividades: ${dadosSistema.totalAtividades}

💰 LEADS (${dadosSistema.leads.length} mais recentes):
${dadosSistema.leads.map((l: any) => `${l.NOME} | R$ ${l.VALOR?.toLocaleString('pt-BR') || 0} | ${l.CODESTAGIO || 'N/A'}`).join('\n')}

👥 PARCEIROS (${dadosSistema.parceiros.length}):
${dadosSistema.parceiros.map((p: any) => `${p.NOMEPARC} | ${p.NOMECID || 'N/A'}`).join('\n')}

📦 PRODUTOS (${dadosSistema.produtos.length}):
${dadosSistema.produtos.map((p: any) => {
  const estoque = parseFloat(p.ESTOQUE || '0');
  return `${p.DESCRPROD} | Estoque: ${estoque.toFixed(0)} ${estoque > 0 ? '✅' : '⚠️'}`;
}).join('\n')}

🛒 PEDIDOS (${dadosSistema.pedidos.length}):
${dadosSistema.pedidos.map((ped: any) => `#${ped.NUNOTA} | ${ped.NOMEPARC} | R$ ${ped.VLRNOTA?.toLocaleString('pt-BR') || 0}`).join('\n')}

PERGUNTA DO USUÁRIO:
${message}`;
        console.log('✅ Dados do sistema carregados e anexados ao primeiro prompt');
      }
    } else {
      console.log('💬 Prompt subsequente - Usando dados já carregados no histórico');
    }

    const chat = model.startChat({
      history: chatHistory,
    });

    // Usar streaming com contexto
    const result = await chat.sendMessageStream(messageWithContext);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            const data = `data: ${JSON.stringify({ text })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Erro no chat Gemini:', error);
    return new Response(JSON.stringify({ error: 'Erro ao processar mensagem' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
