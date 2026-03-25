import mongoose from 'mongoose'
import { nanoid } from 'nanoid'
import type { FilterQuery, IDatabase, QueryOptions } from '../interface.js'

type WithTimestamps = { createdAt: Date; updatedAt: Date }

type MongoDoc = mongoose.Document & { id?: string; _id?: unknown; __v?: unknown }

function toMongoFilter<T>(filter?: FilterQuery<T>): Record<string, unknown> {
  if (!filter) return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
    if (value === undefined || value === null) continue
    result[key] = value
  }
  return result
}

function docToObject<T>(doc: MongoDoc): T {
  const obj = doc.toObject() as Record<string, unknown>
  if (!('id' in obj) && '_id' in obj) {
    obj['id'] = String(obj['_id'])
  }
  delete obj['_id']
  delete obj['__v']
  return obj as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = mongoose.Model<any>

export class MongoDBAdapter<T extends { id: string } & WithTimestamps> implements IDatabase<T> {
  private model: AnyModel

  constructor(collectionName: string, schema: mongoose.Schema) {
    this.model = mongoose.modelNames().includes(collectionName)
      ? mongoose.model(collectionName)
      : mongoose.model(collectionName, schema)
  }

  async findById(id: string): Promise<T | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const doc = await this.model.findOne({ id }).exec()
    return doc ? docToObject<T>(doc as MongoDoc) : null
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const doc = await this.model.findOne(toMongoFilter(filter)).exec()
    return doc ? docToObject<T>(doc as MongoDoc) : null
  }

  async find(filter?: FilterQuery<T>, options?: QueryOptions<T>): Promise<T[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let query = this.model.find(toMongoFilter(filter))

    if (options?.sort) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = query.sort(options.sort as any)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (options?.offset) query = query.skip(options.offset)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (options?.limit) query = query.limit(options.limit)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const docs = await query.exec()
    return (docs as MongoDoc[]).map((doc) => docToObject<T>(doc))
  }

  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const now = new Date()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const doc = new this.model({ ...data, id: nanoid(), createdAt: now, updatedAt: now })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await doc.save()
    return docToObject<T>(doc as MongoDoc)
  }

  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const doc = await this.model
      .findOneAndUpdate({ id }, { ...data, updatedAt: new Date() }, { new: true })
      .exec()
    return doc ? docToObject<T>(doc as MongoDoc) : null
  }

  async delete(id: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.model.deleteOne({ id }).exec()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (result as { deletedCount: number }).deletedCount > 0
  }

  async count(filter?: FilterQuery<T>): Promise<number> {
    return this.model.countDocuments(toMongoFilter(filter)).exec() as Promise<number>
  }
}
