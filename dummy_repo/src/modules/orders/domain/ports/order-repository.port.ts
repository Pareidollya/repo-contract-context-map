// Outbound persistence port contains repository needs for simple CRUD behavior.
export interface OrderRepositoryPort {
  create(order: OrderRecord): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  list(filter: OrderFilter): Promise<OrderRecord[]>;
  update(order: OrderRecord): Promise<OrderRecord>;
  delete(id: string): Promise<boolean>;
}

export interface OrderRecord {
  id: string;
  customerId: string;
  totalCents: number;
  status: 'draft' | 'confirmed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderFilter {
  customerId?: string;
  status?: OrderRecord['status'];
}
