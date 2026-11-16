import type { z } from 'zod';
import { scenarioSchema, reportSchema } from '@/lib/validation';

export type Scenario = z.infer<typeof scenarioSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ConversationMessage = { id: string; role: 'user' | 'customer'; content: string; sequence: number };
export type CustomerProfile = { identity: string; concern: string; stance: number };
export interface AIProvider {
  generateCustomerProfile(scenario: Scenario): Promise<CustomerProfile>;
  generateCustomerOpening(scenario: Scenario, profile: CustomerProfile): Promise<string>;
  generateCustomerReply(scenario: Scenario, profile: CustomerProfile, messages: ConversationMessage[]): Promise<string>;
  generateTrainingReport(scenario: Scenario, messages: ConversationMessage[]): Promise<Report>;
}
