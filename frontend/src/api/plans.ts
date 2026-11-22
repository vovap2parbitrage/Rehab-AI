import { apiRequest, type RequestOptions } from './client'

export interface Plan {
  code: string
  name: string
  max_active_patients: number
  price_uah: number
}

export interface TherapistPlan {
  plan: string
  plan_name: string
  limit: number
  active: number
  pending: number
  free: number
}

export interface PlanPurchase {
  payment_id: string | null
  amount_uah: number
  plan: TherapistPlan
}

export function listPlans(options: RequestOptions = {}): Promise<Plan[]> {
  return apiRequest<Plan[]>('/api/v1/plans/', options, { authenticated: false })
}

export function getMyPlan(options: RequestOptions = {}): Promise<TherapistPlan> {
  return apiRequest<TherapistPlan>('/api/v1/therapists/me/plan', options)
}

export function purchasePlan(planCode: string): Promise<PlanPurchase> {
  return apiRequest<PlanPurchase>('/api/v1/therapists/me/plan/purchase', {
    method: 'POST',
    body: JSON.stringify({ plan_code: planCode }),
  })
}
