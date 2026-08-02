// Application contracts describe CRUD data without exposing NestJS transport details.
export type OrderStatus = 'draft' | 'confirmed' | 'cancelled';

export interface OrderView {
  id: string;
  customerId: string;
  totalCents: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInput {
  customerId: string;
  totalCents: number;
}

export interface UpdateOrderInput {
  orderId: string;
  totalCents?: number;
  status?: OrderStatus;
}

export interface ListOrdersInput {
  customerId?: string;
  status?: OrderStatus;
}

export interface DeleteOrderInput {
  orderId: string;
}
