export type SortOrder = 1 | -1

export interface QueryOptions<T> {
  limit?: number
  offset?: number
  sort?: Partial<Record<keyof T, SortOrder>>
}

export type FilterQuery<T> = Partial<{
  [K in keyof T]: T[K] | { $in: T[K][] } | { $ne: T[K] }
}>

/**
 * Generic database interface. Both MongoDB and LowDB adapters implement this.
 * T must have an `id` string field.
 */
export interface IDatabase<T extends { id: string }> {
  findById(id: string): Promise<T | null>
  findOne(filter: FilterQuery<T>): Promise<T | null>
  find(filter?: FilterQuery<T>, options?: QueryOptions<T>): Promise<T[]>
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>
  update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T | null>
  delete(id: string): Promise<boolean>
  count(filter?: FilterQuery<T>): Promise<number>
}
