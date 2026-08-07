# Contract Context: dummy_repo

Target root: `dummy_repo`
Matched files: 3

> Navigation: read `## Content Map`, find relevant module or file, then retrieve only its mapped line range (`L#####-L#####`).

## Content Map

- `database`: L00018-L00043
  - `prisma/schema.prisma`: L00020-L00043
- `orders`: L00045-L00100
  - `src/modules/orders/application/contracts/order.contract.ts`: L00047-L00076
  - `src/modules/orders/domain/ports/order-repository.port.ts`: L00078-L00100

---

## database

### `prisma/schema.prisma`

```prisma
// Minimal persistence model used by contract extraction tests.
generator client
  provider = "prisma-client-js"

datasource db
  provider = "postgresql"
  url      = env("DATABASE_URL")

model Order
  id         String      @id @default(cuid())
  customerId String
  totalCents Int
  status     OrderStatus @default(draft)
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

enum OrderStatus
  draft
  confirmed
  cancelled
```

## orders

### `src/modules/orders/application/contracts/order.contract.ts`

```typescript
// Application contracts describe CRUD data without exposing NestJS transport details.
type OrderStatus = 'draft' | 'confirmed' | 'cancelled'

interface OrderView
  id: string
  customerId: string
  totalCents: number
  status: OrderStatus
  createdAt: Date
  updatedAt: Date

interface CreateOrderInput
  customerId: string
  totalCents: number

interface UpdateOrderInput
  orderId: string
  totalCents?: number
  status?: OrderStatus

interface ListOrdersInput
  customerId?: string
  status?: OrderStatus

interface DeleteOrderInput
  orderId: string
```

### `src/modules/orders/domain/ports/order-repository.port.ts`

```typescript
// Outbound persistence port contains repository needs for simple CRUD behavior.
interface OrderRepositoryPort
  create(order: OrderRecord): Promise<OrderRecord>
  findById(id: string): Promise<OrderRecord | null>
  list(filter: OrderFilter): Promise<OrderRecord[]>
  update(order: OrderRecord): Promise<OrderRecord>
  delete(id: string): Promise<boolean>

interface OrderRecord
  id: string
  customerId: string
  totalCents: number
  status: 'draft' | 'confirmed' | 'cancelled'
  createdAt: Date
  updatedAt: Date

interface OrderFilter
  customerId?: string
  status?: OrderRecord['status']
```