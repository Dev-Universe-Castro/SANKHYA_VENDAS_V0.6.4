
import { NextResponse } from 'next/server';

const SANKHYA_BASE_URL = "https://api.sandbox.sankhya.com.br";
const LOGIN_ENDPOINT = `${SANKHYA_BASE_URL}/login`;
const URL_LOADRECORDS_SERVICO = `${SANKHYA_BASE_URL}/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.loadRecords&outputType=json`;

const LOGIN_HEADERS = {
  'token': process.env.SANKHYA_TOKEN || "",
  'appkey': process.env.SANKHYA_APPKEY || "",
  'username': process.env.SANKHYA_USERNAME || "",
  'password': process.env.SANKHYA_PASSWORD || ""
};

let cachedToken: string | null = null;

async function obterToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }

  try {
    const resposta = await fetch(LOGIN_ENDPOINT, {
      method: 'POST',
      headers: LOGIN_HEADERS,
      body: JSON.stringify({})
    });

    if (!resposta.ok) {
      throw new Error('Erro ao autenticar no Sankhya');
    }

    const data = await resposta.json();
    const token = data.bearerToken || data.token;

    if (!token) {
      throw new Error('Token não encontrado na resposta');
    }

    cachedToken = token;
    return token;

  } catch (erro: any) {
    console.error('Erro no login Sankhya:', erro);
    cachedToken = null;
    throw erro;
  }
}

async function fazerRequisicaoAutenticada(fullUrl: string, method = 'POST', data = {}) {
  const token = await obterToken();

  try {
    const response = await fetch(fullUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        cachedToken = null;
        throw new Error("Sessão expirada. Tente novamente.");
      }
      throw new Error(`Erro HTTP ${response.status}`);
    }

    return await response.json();
  } catch (erro: any) {
    throw erro;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const pagina = parseInt(searchParams.get('pagina') || '1');
    const codigoEmpresa = searchParams.get('codigoEmpresa') || '1';
    const codigoParceiro = searchParams.get('codigoParceiro') || '';
    const statusFinanceiro = searchParams.get('statusFinanceiro') || '3'; // Status: Real ou Provisão
    const tipoFinanceiro = searchParams.get('tipoFinanceiro') || '3'; // Tipo: Baixado ou Pendente
    const dataNegociacaoInicio = searchParams.get('dataNegociacaoInicio') || '';
    const dataNegociacaoFinal = searchParams.get('dataNegociacaoFinal') || '';

    // Construir critérios de busca
    const criterios: string[] = [];

    // Sempre buscar apenas RECEITAS (RECDESP = 1)
    criterios.push("RECDESP = 1");

    // Filtro por empresa
    criterios.push(`CODEMP = ${codigoEmpresa}`);

    // Filtro por parceiro (obrigatório)
    if (codigoParceiro) {
      criterios.push(`CODPARC = ${codigoParceiro}`);
    }

    // Filtro por Status Financeiro (Real ou Provisão)
    if (statusFinanceiro === "1") {
      // Real
      criterios.push("PROVISAO = 'N'");
    } else if (statusFinanceiro === "2") {
      // Provisão
      criterios.push("PROVISAO = 'S'");
    }
    // statusFinanceiro === "3" busca todos (Real e Provisão)

    // Filtro por Tipo Financeiro (Baixado ou Pendente)
    if (tipoFinanceiro === "1") {
      // Pendente (não baixado)
      criterios.push("DHBAIXA IS NULL");
    } else if (tipoFinanceiro === "2") {
      // Baixado
      criterios.push("DHBAIXA IS NOT NULL");
    }
    // tipoFinanceiro === "3" busca todos (baixados e pendentes)

    // Filtro por data de negociação
    if (dataNegociacaoInicio) {
      criterios.push(`DTNEG >= TO_DATE('${dataNegociacaoInicio}', 'YYYY-MM-DD')`);
    }
    if (dataNegociacaoFinal) {
      criterios.push(`DTNEG <= TO_DATE('${dataNegociacaoFinal}', 'YYYY-MM-DD')`);
    }

    const criterioExpression = criterios.join(' AND ');

    // Calcular offset
    const limit = 50;
    const offset = (pagina - 1) * limit;

    // Payload para loadRecords
    const PAYLOAD = {
      "requestBody": {
        "dataSet": {
          "rootEntity": "Financeiro",
          "includePresentationFields": "N",
          "offsetPage": String(offset),
          "limit": String(limit),
          "entity": {
            "fieldset": {
              "list": "NUFIN, CODPARC, CODEMP, VLRDESDOB, DTVENC, DTNEG, PROVISAO, DHBAIXA, VLRBAIXA, RECDESP, NOSSONUM, CODCTABCOINT, HISTORICO, NUMNOTA"
            }
          },
          "criteria": {
            "expression": {
              "$": criterioExpression
            }
          },
          "orderBy": {
            "expression": {
              "$": "NUFIN DESC"
            }
          }
        }
      }
    };

    console.log('🔍 Buscando títulos a receber da tabela TGFFIN');
    console.log('📋 Critérios:', criterioExpression);

    const respostaCompleta = await fazerRequisicaoAutenticada(
      URL_LOADRECORDS_SERVICO,
      'POST',
      PAYLOAD
    );

    const entities = respostaCompleta.responseBody?.entities;

    if (!entities || !entities.entity) {
      console.log('ℹ️ Nenhum título encontrado');
      return NextResponse.json({
        titulos: [],
        pagination: {
          page: String(pagina),
          offset: String(offset),
          total: "0",
          hasMore: "false"
        }
      });
    }

    // Mapear campos
    const fieldNames = entities.metadata?.fields?.field?.map((f: any) => f.name) || [];
    const entityArray = Array.isArray(entities.entity) ? entities.entity : [entities.entity];

    // Buscar nomes dos parceiros
    const codigosParceiros = [...new Set(entityArray.map((entity: any) => {
      const codParcIndex = fieldNames.indexOf('CODPARC');
      return entity[`f${codParcIndex}`]?.$;
    }).filter(Boolean))];

    const parceirosMap = new Map();
    for (const codParceiro of codigosParceiros) {
      try {
        const parceiroResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sankhya/parceiros?searchCode=${codParceiro}&pageSize=1`);
        if (parceiroResponse.ok) {
          const parceiroData = await parceiroResponse.json();
          if (parceiroData.parceiros && parceiroData.parceiros.length > 0) {
            const parceiro = parceiroData.parceiros[0];
            parceirosMap.set(codParceiro, parceiro.NOMEPARC || parceiro.RAZAOSOCIAL || `Parceiro ${codParceiro}`);
          }
        }
      } catch (error) {
        console.error(`Erro ao buscar parceiro ${codParceiro}:`, error);
      }
    }

    // Mapear os dados
    const titulos = entityArray.map((rawEntity: any) => {
      const cleanObject: any = {};
      for (let i = 0; i < fieldNames.length; i++) {
        const fieldKey = `f${i}`;
        const fieldName = fieldNames[i];
        if (rawEntity[fieldKey]) {
          cleanObject[fieldName] = rawEntity[fieldKey].$;
        }
      }

      const nomeParceiro = parceirosMap.get(cleanObject.CODPARC) || `Parceiro ${cleanObject.CODPARC}`;

      // Determinar tipo financeiro
      const tipoFinanceiroItem: "Real" | "Provisão" = 
        (cleanObject.PROVISAO === "S" || cleanObject.PROVISAO === "s") ? "Provisão" : "Real";

      // Determinar status (apenas Aberto ou Baixado)
      const status: "Aberto" | "Baixado" = 
        (cleanObject.DHBAIXA && cleanObject.DHBAIXA !== null) ? "Baixado" : "Aberto";

      return {
        nroTitulo: String(cleanObject.NUFIN),
        parceiro: nomeParceiro,
        codParceiro: String(cleanObject.CODPARC),
        valor: parseFloat(cleanObject.VLRDESDOB) || 0,
        dataVencimento: cleanObject.DTVENC ? cleanObject.DTVENC.split(' ')[0] : '',
        dataNegociacao: cleanObject.DTNEG ? cleanObject.DTNEG.split(' ')[0] : '',
        status,
        tipoFinanceiro: tipoFinanceiroItem,
        tipoTitulo: cleanObject.NOSSONUM ? "Boleto" : "Duplicata",
        contaBancaria: cleanObject.CODCTABCOINT ? `Conta ${cleanObject.CODCTABCOINT}` : null,
        historico: cleanObject.HISTORICO || null,
        numeroParcela: 1,
        origemFinanceiro: "TGFFIN",
        codigoEmpresa: parseInt(cleanObject.CODEMP) || 1,
        codigoNatureza: 0,
        boleto: {
          codigoBarras: null,
          nossoNumero: cleanObject.NOSSONUM || null,
          linhaDigitavel: null,
          numeroRemessa: null
        }
      };
    });

    const total = entities.total ? parseInt(entities.total) : titulos.length;
    const hasMore = (offset + titulos.length) < total;

    console.log(`✅ ${titulos.length} título(s) encontrado(s)`);

    return NextResponse.json({
      titulos,
      pagination: {
        page: String(pagina),
        offset: String(offset),
        total: String(total),
        hasMore: String(hasMore)
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar títulos a receber:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    return NextResponse.json(
      {
        error: 'Erro ao buscar títulos a receber',
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
