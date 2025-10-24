
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class RedisCacheService {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private redisClient: any = null;
  private useRedis: boolean = false;
  private defaultTTL = 5 * 60 * 1000; // 5 minutos

  constructor() {
    // Detectar se estamos em produção e se Redis está disponível
    this.initializeRedis();
  }

  private async initializeRedis() {
    // Apenas em produção (Deployment) e se REDIS_URL estiver configurado
    if (process.env.REPLIT_DEPLOYMENT && process.env.REDIS_URL) {
      try {
        const { createClient } = await import('redis');
        this.redisClient = createClient({
          url: process.env.REDIS_URL
        });
        
        await this.redisClient.connect();
        this.useRedis = true;
        console.log('✅ Redis conectado para cache persistente');
      } catch (error) {
        console.warn('⚠️ Redis não disponível, usando cache em memória:', error);
        this.useRedis = false;
      }
    } else {
      console.log('ℹ️ Usando cache em memória (desenvolvimento)');
    }
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const entry = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    };

    if (this.useRedis && this.redisClient) {
      try {
        const ttlSeconds = Math.floor((ttl || this.defaultTTL) / 1000);
        await this.redisClient.setEx(
          key,
          ttlSeconds,
          JSON.stringify(entry)
        );
      } catch (error) {
        console.error('❌ Erro ao salvar no Redis, usando memória:', error);
        this.memoryCache.set(key, entry);
      }
    } else {
      this.memoryCache.set(key, entry);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.useRedis && this.redisClient) {
      try {
        const cached = await this.redisClient.get(key);
        if (!cached) return null;

        const entry = JSON.parse(cached) as CacheEntry<T>;
        const now = Date.now();
        const age = now - entry.timestamp;

        if (age > entry.ttl) {
          await this.redisClient.del(key);
          return null;
        }

        return entry.data as T;
      } catch (error) {
        console.error('❌ Erro ao ler do Redis:', error);
        // Fallback para memória
      }
    }

    // Fallback para cache em memória
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  async has(key: string): Promise<boolean> {
    const data = await this.get(key);
    return data !== null;
  }

  async delete(key: string): Promise<void> {
    if (this.useRedis && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (error) {
        console.error('❌ Erro ao deletar do Redis:', error);
      }
    }
    this.memoryCache.delete(key);
  }

  async clear(): Promise<void> {
    if (this.useRedis && this.redisClient) {
      try {
        await this.redisClient.flushDb();
      } catch (error) {
        console.error('❌ Erro ao limpar Redis:', error);
      }
    }
    this.memoryCache.clear();
  }

  async cleanup(): Promise<void> {
    // Para Redis, o cleanup é automático via TTL
    // Para memória, fazemos manualmente
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        this.memoryCache.delete(key);
      }
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;

    if (this.useRedis && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(`*${pattern}*`);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
          count += keys.length;
        }
      } catch (error) {
        console.error('❌ Erro ao invalidar padrão no Redis:', error);
      }
    }

    // Também limpar da memória
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    console.log(`🗑️ Invalidados ${count} registros de cache com padrão: ${pattern}`);
    return count;
  }

  async invalidateParceiros(): Promise<number> {
    return this.invalidatePattern('parceiros');
  }

  async invalidateProdutos(): Promise<number> {
    return this.invalidatePattern('produtos');
  }

  async invalidateEstoque(): Promise<number> {
    return this.invalidatePattern('estoque');
  }

  async invalidatePrecos(): Promise<number> {
    return this.invalidatePattern('preco');
  }

  async getStats() {
    const memorySize = this.memoryCache.size;
    const memoryKeys = Array.from(this.memoryCache.keys());
    
    let redisSize = 0;
    if (this.useRedis && this.redisClient) {
      try {
        redisSize = await this.redisClient.dbSize();
      } catch (error) {
        console.error('❌ Erro ao obter stats do Redis:', error);
      }
    }

    return {
      memorySize,
      redisSize,
      usingRedis: this.useRedis,
      memoryKeys
    };
  }
}

export const redisCacheService = new RedisCacheService();

// Limpar cache em memória a cada 10 minutos
setInterval(() => {
  redisCacheService.cleanup();
}, 10 * 60 * 1000);
