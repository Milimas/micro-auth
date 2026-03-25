import { JSONFile } from 'lowdb/node'
import { Low } from 'lowdb'
import { nanoid } from 'nanoid'
import type { FilterQuery, IDatabase, QueryOptions } from '../interface.js'

type WithTimestamps = { createdAt: Date; updatedAt: Date }
type DbData<T> = { items: T[] }

function matchesFilter<T extends object>(item: T, filter: FilterQuery<T>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const itemValue = item[key as keyof T]
    if (condition === null || condition === undefined) return true
    if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
      const op = condition as Record<string, unknown>
      if ('$in' in op) return (op['$in'] as unknown[]).includes(itemValue)
      if ('$ne' in op) return itemValue !== op['$ne']
    }
    return itemValue === condition
  })
}

export class LowDBAdapter<T extends { id: string } & WithTimestamps> implements IDatabase<T> {
  private db!: Low<DbData<T>>

  private constructor(private readonly filePath: string) {}

  static async create<T extends { id: string } & WithTimestamps>(
    filePath: string,
  ): Promise<LowDBAdapter<T>> {
    const adapter = new LowDBAdapter<T>(filePath)
    const file = new JSONFile<DbData<T>>(filePath)
    adapter.db = new Low<DbData<T>>(file, { items: [] })
    await adapter.db.read()
    await adapter.db.write() // persist default { items: [] } if file doesn't exist yet
    return adapter
  }

  async findById(id: string): Promise<T | null> {
    return this.db.data.items.find((item) => item.id === id) ?? null
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.db.data.items.find((item) => matchesFilter(item, filter)) ?? null
  }

  async find(filter?: FilterQuery<T>, options?: QueryOptions<T>): Promise<T[]> {
    let results = filter
      ? this.db.data.items.filter((item) => matchesFilter(item, filter))
      : [...this.db.data.items]

    if (options?.sort) {
      const [sortKey, sortDir] = Object.entries(options.sort)[0] as [keyof T, 1 | -1]
      results.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        if (aVal < bVal) return -1 * sortDir
        if (aVal > bVal) return 1 * sortDir
        return 0
      })
    }

    const offset = options?.offset ?? 0
    const limit = options?.limit

    results = results.slice(offset)
    if (limit !== undefined) results = results.slice(0, limit)

    return results
  }

  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const now = new Date()
    const item = { ...data, id: nanoid(), createdAt: now, updatedAt: now } as T
    this.db.data.items.push(item)
    await this.db.write()
    return item
  }

  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T | null> {
    const index = this.db.data.items.findIndex((item) => item.id === id)
    if (index === -1) return null
    const existing = this.db.data.items[index]!
    const updated = { ...existing, ...data, id, updatedAt: new Date() } as T
    this.db.data.items[index] = updated
    await this.db.write()
    return updated
  }

  async delete(id: string): Promise<boolean> {
    const before = this.db.data.items.length
    this.db.data.items = this.db.data.items.filter((item) => item.id !== id)
    if (this.db.data.items.length === before) return false
    await this.db.write()
    return true
  }

  async count(filter?: FilterQuery<T>): Promise<number> {
    if (!filter) return this.db.data.items.length
    return this.db.data.items.filter((item) => matchesFilter(item, filter)).length
  }
}
