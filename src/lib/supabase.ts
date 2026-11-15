import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Only the public (publishable) key is ever used in the browser. Access to private
// data is enforced by Row Level Security in the database, not by this client.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ------------------------------------------------------------------
// Database entity types (mirror supabase/migrations)
// ------------------------------------------------------------------
export type AppRole = 'OWNER' | 'ADMIN';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicSettings {
  business_name: string;
  tagline: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  maps_url: string | null;
  social: { facebook?: string; instagram?: string; tiktok?: string; youtube?: string };
  about_text: string | null;
  mission: string | null;
  vision: string | null;
  currency: string;
}

export interface BusinessSettings extends PublicSettings {
  id: 1;
  timezone: string;
  invoice_prefix: string;
  receipt_prefix: string;
  default_due_days: number;
  billing_rules: { partial_month: 'prorate_by_days' | 'full_month'; bill_on_day: number };
  booking_terms: string | null;
  notification_prefs: { document_expiry_days: number; service_reminder_days: number; booking_reminder_days: number };
}

export interface Service {
  id: string; slug: string; title: string; summary: string; description: string | null;
  icon: string; sort_order: number; is_published: boolean;
}

export interface PublicVehicle {
  id: string; title: string; description: string | null; specs: string | null; image_url: string | null;
  hire_info: string | null; sort_order: number; vehicle_type: 'bus' | 'van' | 'three_wheeler' | 'other';
  seating_capacity: number; fuel_type: string;
}

export type InquiryStatus = 'new' | 'contacted' | 'quotation_sent' | 'converted' | 'closed';

export interface Inquiry {
  id: string; reference: string; customer_name: string; phone: string; email: string | null;
  service: string; preferred_vehicle: string | null; pickup_location: string | null; destination: string | null;
  travel_date: string | null; passenger_count: number | null; driver_requirement: string | null;
  message: string | null; status: InquiryStatus; admin_notes: string | null; created_at: string;
}

export interface WebsiteContent { key: string; title: string | null; body: string | null; data: Record<string, unknown>; is_published: boolean }

export interface AppNotification {
  id: string; kind: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string;
}

// ------------------------------------------------------------------
// Phase 2 entities
// ------------------------------------------------------------------
export type VehicleType = 'bus' | 'van' | 'three_wheeler' | 'other';
export type VehicleStatus = 'active' | 'under_maintenance' | 'unavailable' | 'inactive';
export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'electric' | 'lpg' | 'other';

export interface Vehicle {
  id: string; name: string; vehicle_type: VehicleType; registration_number: string; brand: string | null; model: string | null;
  manufacturing_year: number | null; seating_capacity: number; fuel_type: FuelType; fuel_tank_capacity: number | null;
  odometer_km: number; ownership_info: string | null; photo_paths: string[]; insurance_expiry: string | null;
  revenue_licence_expiry: string | null; emission_expiry: string | null; status: VehicleStatus; notes: string | null;
  is_archived: boolean; created_at: string;
}

export interface PublicVehicleListing {
  id: string; vehicle_id: string; title: string; description: string | null; specs: string | null;
  image_url: string | null; hire_info: string | null; is_published: boolean;
}

export interface Driver {
  id: string; full_name: string; phone: string; address: string | null; licence_number: string | null; licence_expiry: string | null;
  emergency_contact: string | null; assigned_vehicle_id: string | null; is_owner: boolean;
  status: 'active' | 'inactive' | 'on_leave'; notes: string | null; is_archived: boolean;
}

export type CustomerCategory = 'individual' | 'school' | 'corporate' | 'other';
export interface Customer {
  id: string; full_name: string; phone: string; email: string | null; address: string | null;
  category: CustomerCategory; notes: string | null; is_archived: boolean; created_at: string;
}

export interface School {
  id: string; name: string; address: string | null; contact_person: string | null; contact_phone: string | null; email: string | null;
  agreement_details: string | null; start_date: string | null; status: 'active' | 'inactive'; notes: string | null; is_archived: boolean;
}

export type StudentStatus = 'active' | 'paused' | 'completed' | 'withdrawn';
export interface Student {
  id: string; student_code: string; full_name: string; school_id: string; guardian_name: string; guardian_phone: string;
  secondary_contact: string | null; pickup_location: string | null; dropoff_location: string | null; vehicle_id: string | null;
  guardian_email: string | null;
  monthly_fee: number; start_date: string; end_date: string | null; status: StudentStatus; notes: string | null;
}

export interface TransportRoute {
  id: string; name: string; school_id: string | null; vehicle_id: string | null; driver_id: string | null;
  operating_days: number[]; departure_time: string; return_time: string; status: 'active' | 'inactive'; notes: string | null;
}
export interface RouteStop { id: string; route_id: string; stop_type: 'pickup' | 'dropoff'; name: string; sequence: number; scheduled_time: string | null }
export interface StudentRouteAssignment { id: string; student_id: string; route_id: string; start_date: string; end_date: string | null }

// ------------------------------------------------------------------
// Phase 3 entities
// ------------------------------------------------------------------
export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other';

export interface Invoice {
  id: string; invoice_number: string; student_id: string; school_id: string; billing_month: string;
  monthly_fee: number; previous_balance: number; discount: number; adjustment: number; total_payable: number;
  amount_paid: number; balance: number; status: InvoiceStatus; due_date: string; notes: string | null;
}

export interface Payment {
  id: string; reference: string; payment_date: string; amount: number; method: PaymentMethod; category: string;
  invoice_id: string | null; booking_id: string | null; student_id: string | null; vehicle_id: string | null;
  notes: string | null; created_at: string;
}

export type BookingStatus = 'inquiry' | 'quotation_sent' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type HireType = 'bus_hire' | 'van_hire' | 'tuk_tuk_hire' | 'private' | 'other';
export type DriverArrangement = 'owner_drives' | 'external_driver' | 'vehicle_only';

export interface Booking {
  id: string; reference: string; customer_id: string; vehicle_id: string; hire_type: HireType; start_at: string; end_at: string;
  pickup_location: string | null; destination: string | null; return_location: string | null; passenger_count: number | null;
  distance_km: number | null; agreed_price: number; advance_amount: number; fuel_cost: number; other_expenses: number;
  arrangement: DriverArrangement; assigned_driver_id: string | null; status: BookingStatus; notes: string | null;
}

export interface DriverAssignment {
  id: string; booking_id: string; driver_id: string; agreed_fee: number; advance_paid: number; payment_status: 'unpaid' | 'partially_paid' | 'paid';
}

// ------------------------------------------------------------------
// Phase 4 entities
// ------------------------------------------------------------------
export interface ExpenseCategory { id: string; name: string; is_system: boolean; sort_order: number }
export interface Expense {
  id: string; reference: string; expense_date: string; category_id: string; description: string; amount: number;
  vehicle_id: string | null; booking_id: string | null; payment_method: PaymentMethod; supplier: string | null;
  receipt_path: string | null; notes: string | null; source: 'manual' | 'fuel' | 'maintenance' | 'driver_payment';
}
export interface FuelRecord {
  id: string; vehicle_id: string; fuel_date: string; fuel_type: FuelType; litres: number; total_cost: number;
  odometer_km: number | null; fuel_station: string | null; receipt_path: string | null; notes: string | null;
}
export type MaintenanceType = 'oil_change' | 'engine_repair' | 'tyre_replacement' | 'battery_replacement' | 'general_service' | 'electrical_repair' | 'other';
export interface Maintenance {
  id: string; vehicle_id: string; service_date: string; category: MaintenanceType; description: string | null; service_provider: string | null;
  cost: number; odometer_km: number | null; next_service_date: string | null; next_service_odometer_km: number | null; receipt_path: string | null;
}
export type DocumentType = 'insurance' | 'revenue_licence' | 'emission_certificate' | 'registration' | 'service_invoice' | 'agreement' | 'other';
export interface VehicleDocument {
  id: string; vehicle_id: string; doc_type: DocumentType; title: string; file_path: string | null; issue_date: string | null;
  expiry_date: string | null; renewal_status: 'valid' | 'due_soon' | 'expired' | 'renewed'; notes: string | null;
}
