export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      group_order_rooms: {
        Row: {
          created_at: string
          delivery_pence: number
          id: string
          location_id: string
          master_order_id: string | null
          payment_mode: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          delivery_pence?: number
          id?: string
          location_id: string
          master_order_id?: string | null
          payment_mode: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          delivery_pence?: number
          id?: string
          location_id?: string
          master_order_id?: string | null
          payment_mode?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_order_rooms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_order_rooms_tenant_id_location_id_fkey"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "group_order_rooms_tenant_id_location_id_master_order_id_fkey"
            columns: ["tenant_id", "location_id", "master_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      kds_ticket_items: {
        Row: {
          id: string
          location_id: string
          order_id: string
          order_item_id: string
          prep_kind: string
          prep_seconds: number | null
          quantity: number
          ready_at: string | null
          started_at: string | null
          station_id: string
          status: string
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          id?: string
          location_id: string
          order_id: string
          order_item_id: string
          prep_kind?: string
          prep_seconds?: number | null
          quantity: number
          ready_at?: string | null
          started_at?: string | null
          station_id: string
          status?: string
          tenant_id: string
          ticket_id: string
        }
        Update: {
          id?: string
          location_id?: string
          order_id?: string
          order_item_id?: string
          prep_kind?: string
          prep_seconds?: number | null
          quantity?: number
          ready_at?: string | null
          started_at?: string | null
          station_id?: string
          status?: string
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kds_ticket_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_ticket_items_tenant_id_location_id_order_id_ticket_id__fkey"
            columns: [
              "tenant_id",
              "location_id",
              "order_id",
              "ticket_id",
              "station_id",
            ]
            isOneToOne: false
            referencedRelation: "kds_tickets"
            referencedColumns: [
              "tenant_id",
              "location_id",
              "order_id",
              "id",
              "station_id",
            ]
          },
          {
            foreignKeyName: "kds_ticket_items_tenant_id_order_id_order_item_id_fkey"
            columns: ["tenant_id", "order_id", "order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["tenant_id", "order_id", "id"]
          },
        ]
      }
      kds_tickets: {
        Row: {
          created_at: string
          id: string
          location_id: string
          order_id: string
          ready_at: string | null
          started_at: string | null
          station_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          order_id: string
          ready_at?: string | null
          started_at?: string | null
          station_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          order_id?: string
          ready_at?: string | null
          started_at?: string | null
          station_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kds_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_tickets_tenant_id_location_id_order_id_fkey"
            columns: ["tenant_id", "location_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "kds_tickets_tenant_id_location_id_station_id_fkey"
            columns: ["tenant_id", "location_id", "station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      kitchen_stations: {
        Row: {
          active: boolean
          code: string
          id: string
          location_id: string
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          location_id: string
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          location_id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_stations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_stations_tenant_id_location_id_fkey"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_checkout_groups: {
        Row: {
          created_at: string
          currency: string
          id: string
          location_id: string
          order_id: string
          owner_id: string
          owner_pence: number
          revision: number
          status: string
          tenant_id: string
          total_pence: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          location_id: string
          order_id: string
          owner_id: string
          owner_pence: number
          revision?: number
          status?: string
          tenant_id: string
          total_pence: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          location_id?: string
          order_id?: string
          owner_id?: string
          owner_pence?: number
          revision?: number
          status?: string
          tenant_id?: string
          total_pence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "standalone_checkout_group_scope"
            columns: ["tenant_id", "location_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      mealdeck_checkout_invites: {
        Row: {
          accepted_at: string | null
          amount_pence: number
          created_at: string
          expires_at: string
          group_id: string
          id: string
          participant_id: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          amount_pence: number
          created_at?: string
          expires_at: string
          group_id: string
          id?: string
          participant_id: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          amount_pence?: number
          created_at?: string
          expires_at?: string
          group_id?: string
          id?: string
          participant_id?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_checkout_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_checkout_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      mealdeck_fulfilment_outbox: {
        Row: {
          cost_pence: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          location_id: string
          order_id: string
          provider: string
          provider_booking_ref: string | null
          quote_expires_at: string
          quote_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cost_pence: number
          created_at?: string
          currency: string
          id?: string
          idempotency_key: string
          location_id: string
          order_id: string
          provider: string
          provider_booking_ref?: string | null
          quote_expires_at: string
          quote_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cost_pence?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          location_id?: string
          order_id?: string
          provider?: string
          provider_booking_ref?: string | null
          quote_expires_at?: string
          quote_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_fulfilment_outbox_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_fulfilment_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_fulfilment_order_scope"
            columns: ["tenant_id", "location_id", "order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      mealdeck_fulfilment_provider_events: {
        Row: {
          event_kind: string
          id: string
          location_id: string
          occurred_at: string
          order_id: string
          outbox_id: string
          provider: string
          provider_event_id: string
          received_at: string
          tenant_id: string
        }
        Insert: {
          event_kind: string
          id?: string
          location_id: string
          occurred_at: string
          order_id: string
          outbox_id: string
          provider: string
          provider_event_id: string
          received_at?: string
          tenant_id: string
        }
        Update: {
          event_kind?: string
          id?: string
          location_id?: string
          occurred_at?: string
          order_id?: string
          outbox_id?: string
          provider?: string
          provider_event_id?: string
          received_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_fulfilment_provider__outbox_id_tenant_id_location_fkey"
            columns: ["outbox_id", "tenant_id", "location_id", "order_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_fulfilment_outbox"
            referencedColumns: ["id", "tenant_id", "location_id", "order_id"]
          },
        ]
      }
      mealdeck_handoff_proofs: {
        Row: {
          created_at: string
          expires_at: string
          failed_attempts: number
          id: string
          location_id: string
          mode: string
          order_id: string
          proof_hmac: string
          tenant_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          failed_attempts?: number
          id?: string
          location_id: string
          mode: string
          order_id: string
          proof_hmac: string
          tenant_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          location_id?: string
          mode?: string
          order_id?: string
          proof_hmac?: string
          tenant_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_handoff_proofs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_handoff_proofs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_handoff_order_scope"
            columns: ["tenant_id", "location_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      mealdeck_ops_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          location_id: string | null
          next_value: Json | null
          previous_value: Json | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          location_id?: string | null
          next_value?: Json | null
          previous_value?: Json | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          location_id?: string | null
          next_value?: Json | null
          previous_value?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_audit_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_scope_c20b0bd9dc5866f9"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_batch_issues: {
        Row: {
          base_quantity: number
          batch_id: string
          id: string
          issue_reference: string
          issued_at: string
          issued_by: string
          location_id: string
          note: string
          reason: string
          tenant_id: string
        }
        Insert: {
          base_quantity: number
          batch_id: string
          id?: string
          issue_reference: string
          issued_at?: string
          issued_by: string
          location_id: string
          note?: string
          reason: string
          tenant_id: string
        }
        Update: {
          base_quantity?: number
          batch_id?: string
          id?: string
          issue_reference?: string
          issued_at?: string
          issued_by?: string
          location_id?: string
          note?: string
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_batch_issues_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_batch_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_batch_issues_tenant_id_location_id_batch_id_fkey"
            columns: ["tenant_id", "location_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_stock_batches"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_81eaa9569eeda52c"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_expenses: {
        Row: {
          amount_pence: number
          category: string
          created_at: string
          id: string
          location_id: string
          note: string
          occurred_on: string
          recorded_by: string | null
          tenant_id: string
        }
        Insert: {
          amount_pence: number
          category: string
          created_at?: string
          id?: string
          location_id: string
          note?: string
          occurred_on: string
          recorded_by?: string | null
          tenant_id: string
        }
        Update: {
          amount_pence?: number
          category?: string
          created_at?: string
          id?: string
          location_id?: string
          note?: string
          occurred_on?: string
          recorded_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_expenses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_scope_9249bb58f0fbe17b"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_ingredient_costs: {
        Row: {
          cost_per_unit_pence: number
          created_at: string
          effective_on: string
          id: string
          ingredient_id: string
          location_id: string
          recorded_by: string | null
          supplier: string
          tenant_id: string
        }
        Insert: {
          cost_per_unit_pence: number
          created_at?: string
          effective_on: string
          id?: string
          ingredient_id: string
          location_id: string
          recorded_by?: string | null
          supplier?: string
          tenant_id: string
        }
        Update: {
          cost_per_unit_pence?: number
          created_at?: string
          effective_on?: string
          id?: string
          ingredient_id?: string
          location_id?: string
          recorded_by?: string | null
          supplier?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_ingredient_costs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_ingredient_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_ingredient_costs_tenant_id_ingredient_id_fkey"
            columns: ["tenant_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_ingredients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_3b8ebc72a65184f1"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_ingredients: {
        Row: {
          active: boolean
          allergens: string[]
          base_unit: string
          created_at: string
          id: string
          name: string
          reorder_threshold: number
          sku: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allergens?: string[]
          base_unit: string
          created_at?: string
          id?: string
          name: string
          reorder_threshold?: number
          sku?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allergens?: string[]
          base_unit?: string
          created_at?: string
          id?: string
          name?: string
          reorder_threshold?: number
          sku?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_ingredients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mealdeck_ops_purchase_lines: {
        Row: {
          base_units_per_pack: number
          created_at: string
          id: string
          ingredient_id: string
          location_id: string
          pack_count: number
          price_per_pack_pence: number
          purchase_order_id: string
          received_base_units: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_units_per_pack: number
          created_at?: string
          id?: string
          ingredient_id: string
          location_id: string
          pack_count: number
          price_per_pack_pence: number
          purchase_order_id: string
          received_base_units?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_units_per_pack?: number
          created_at?: string
          id?: string
          ingredient_id?: string
          location_id?: string
          pack_count?: number
          price_per_pack_pence?: number
          purchase_order_id?: string
          received_base_units?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_purchase_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_purchase_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_purchase_lines_tenant_id_ingredient_id_fkey"
            columns: ["tenant_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_ingredients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_purchase_lines_tenant_id_location_id_purchase_fkey"
            columns: ["tenant_id", "location_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_purchase_orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_9de3eaa88b079431"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          location_id: string
          note: string
          status: string
          supplier_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          location_id: string
          note?: string
          status?: string
          supplier_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          location_id?: string
          note?: string
          status?: string
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_purchase_orders_tenant_id_supplier_id_fkey"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_3ef8616b2dfbb6f9"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_purchase_receipts: {
        Row: {
          base_quantity: number
          batch_id: string
          delivery_reference: string
          id: string
          location_id: string
          purchase_line_id: string
          received_at: string
          received_by: string
          tenant_id: string
        }
        Insert: {
          base_quantity: number
          batch_id: string
          delivery_reference: string
          id?: string
          location_id: string
          purchase_line_id: string
          received_at?: string
          received_by: string
          tenant_id: string
        }
        Update: {
          base_quantity?: number
          batch_id?: string
          delivery_reference?: string
          id?: string
          location_id?: string
          purchase_line_id?: string
          received_at?: string
          received_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_purchase_receipt_tenant_id_location_id_batch__fkey"
            columns: ["tenant_id", "location_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_stock_batches"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_purchase_receipt_tenant_id_location_id_purcha_fkey"
            columns: ["tenant_id", "location_id", "purchase_line_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_purchase_lines"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_purchase_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_purchase_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_scope_64940cbda6f00d98"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_recipe_history: {
        Row: {
          archived_at: string
          archived_by: string | null
          id: string
          recipe_id: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          id?: string
          recipe_id: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          id?: string
          recipe_id?: string
          snapshot?: Json
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_recipe_history_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_recipe_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_recipe_history_scope"
            columns: ["tenant_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_recipes"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_recipe_lines: {
        Row: {
          ingredient_id: string
          quantity: number
          recipe_id: string
          tenant_id: string
          waste_pct: number
        }
        Insert: {
          ingredient_id: string
          quantity: number
          recipe_id: string
          tenant_id: string
          waste_pct?: number
        }
        Update: {
          ingredient_id?: string
          quantity?: number
          recipe_id?: string
          tenant_id?: string
          waste_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_recipe_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_recipe_lines_tenant_id_ingredient_id_fkey"
            columns: ["tenant_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_ingredients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_recipe_lines_tenant_id_recipe_id_fkey"
            columns: ["tenant_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_recipes"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_recipes: {
        Row: {
          created_at: string
          id: string
          instructions: string
          menu_item_id: string
          prep_minutes: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
          yield_units: number
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string
          menu_item_id: string
          prep_minutes?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          yield_units?: number
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          menu_item_id?: string
          prep_minutes?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          yield_units?: number
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_recipe_menu_scope"
            columns: ["tenant_id", "menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_staff_access: {
        Row: {
          created_at: string
          created_by: string | null
          deny_permissions: string[]
          enabled: boolean
          grant_permissions: string[]
          id: string
          location_id: string | null
          role: string
          scope_key: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deny_permissions?: string[]
          enabled?: boolean
          grant_permissions?: string[]
          id?: string
          location_id?: string | null
          role: string
          scope_key?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deny_permissions?: string[]
          enabled?: boolean
          grant_permissions?: string[]
          id?: string
          location_id?: string | null
          role?: string
          scope_key?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_staff_access_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_staff_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_scope_bdfe7dd002c8247d"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_stock_batches: {
        Row: {
          batch_code: string
          created_at: string
          expiry_kind: string
          expiry_on: string | null
          id: string
          ingredient_id: string
          issued_base_units: number
          location_id: string
          purchase_order_id: string
          received_base_units: number
          supplier_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          batch_code: string
          created_at?: string
          expiry_kind: string
          expiry_on?: string | null
          id?: string
          ingredient_id: string
          issued_base_units?: number
          location_id: string
          purchase_order_id: string
          received_base_units?: number
          supplier_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          batch_code?: string
          created_at?: string
          expiry_kind?: string
          expiry_on?: string | null
          id?: string
          ingredient_id?: string
          issued_base_units?: number
          location_id?: string
          purchase_order_id?: string
          received_base_units?: number
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_stock_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_stock_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_stock_batches_tenant_id_ingredient_id_fkey"
            columns: ["tenant_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_ingredients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_stock_batches_tenant_id_location_id_purchase__fkey"
            columns: ["tenant_id", "location_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_purchase_orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_stock_batches_tenant_id_supplier_id_fkey"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_429e730e69dc2fbb"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_stock_movements: {
        Row: {
          created_at: string
          delta_qty: number
          id: string
          ingredient_id: string
          location_id: string
          note: string
          reason: string
          recorded_by: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          delta_qty: number
          id?: string
          ingredient_id: string
          location_id: string
          note?: string
          reason: string
          recorded_by?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          delta_qty?: number
          id?: string
          ingredient_id?: string
          location_id?: string
          note?: string
          reason?: string
          recorded_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_stock_movements_tenant_id_ingredient_id_fkey"
            columns: ["tenant_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_ingredients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_fb38fa7a3a752d71"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_supplier_credits: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          credit_number: string
          credit_number_key: string | null
          gross_pence: number | null
          id: string
          invoice_id: string
          issued_on: string
          location_id: string
          net_pence: number
          reason: string
          status: string
          supplier_id: string
          tenant_id: string
          updated_at: string
          vat_pence: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          credit_number: string
          credit_number_key?: string | null
          gross_pence?: number | null
          id?: string
          invoice_id: string
          issued_on: string
          location_id: string
          net_pence: number
          reason: string
          status?: string
          supplier_id: string
          tenant_id: string
          updated_at?: string
          vat_pence: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          credit_number?: string
          credit_number_key?: string | null
          gross_pence?: number | null
          id?: string
          invoice_id?: string
          issued_on?: string
          location_id?: string
          net_pence?: number
          reason?: string
          status?: string
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
          vat_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_supplier_credits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_credits_tenant_id_location_id_invoic_fkey"
            columns: ["tenant_id", "location_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_supplier_invoices"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_credits_tenant_id_supplier_id_fkey"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_622617d0229e10ff"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_supplier_invoice_lines: {
        Row: {
          base_quantity: number
          created_at: string
          id: string
          invoice_id: string
          location_id: string
          net_pence: number
          purchase_line_id: string
          tax_category: string
          tenant_id: string
          updated_at: string
          vat_pence: number
        }
        Insert: {
          base_quantity: number
          created_at?: string
          id?: string
          invoice_id: string
          location_id: string
          net_pence: number
          purchase_line_id: string
          tax_category?: string
          tenant_id: string
          updated_at?: string
          vat_pence: number
        }
        Update: {
          base_quantity?: number
          created_at?: string
          id?: string
          invoice_id?: string
          location_id?: string
          net_pence?: number
          purchase_line_id?: string
          tax_category?: string
          tenant_id?: string
          updated_at?: string
          vat_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_supplier_invoic_tenant_id_location_id_purcha_fkey1"
            columns: ["tenant_id", "location_id", "purchase_line_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_purchase_lines"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_invoice_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_invoice_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_invoice_tenant_id_location_id_invoic_fkey"
            columns: ["tenant_id", "location_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_supplier_invoices"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_2066b3d8fea47ca1"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_supplier_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          currency: string
          declared_gross_pence: number | null
          declared_net_pence: number
          declared_vat_pence: number
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_number_key: string | null
          location_id: string
          note: string
          purchase_order_id: string
          status: string
          supplier_id: string
          tax_document_reviewed: boolean
          tax_reviewed_at: string | null
          tax_reviewed_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          currency?: string
          declared_gross_pence?: number | null
          declared_net_pence: number
          declared_vat_pence: number
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          invoice_number_key?: string | null
          location_id: string
          note?: string
          purchase_order_id: string
          status?: string
          supplier_id: string
          tax_document_reviewed?: boolean
          tax_reviewed_at?: string | null
          tax_reviewed_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          declared_gross_pence?: number | null
          declared_net_pence?: number
          declared_vat_pence?: number
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_number_key?: string | null
          location_id?: string
          note?: string
          purchase_order_id?: string
          status?: string
          supplier_id?: string
          tax_document_reviewed?: boolean
          tax_reviewed_at?: string | null
          tax_reviewed_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_supplier_invoice_tenant_id_location_id_purcha_fkey"
            columns: ["tenant_id", "location_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_purchase_orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mealdeck_ops_supplier_invoices_tenant_id_supplier_id_fkey"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "mealdeck_ops_suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "standalone_scope_9ed558c4dfc94646"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mealdeck_ops_suppliers: {
        Row: {
          contact_email: string | null
          created_at: string
          id: string
          lead_time_days: number
          name: string
          note: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          id?: string
          lead_time_days?: number
          name: string
          note?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          id?: string
          lead_time_days?: number
          name?: string
          note?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_ops_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mealdeck_pass_orders: {
        Row: {
          created_at: string
          handed_off_at: string | null
          location_id: string
          order_id: string
          packing_started_at: string | null
          ready_for_handoff_at: string | null
          ready_to_pack_at: string | null
          sealed_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          handed_off_at?: string | null
          location_id: string
          order_id: string
          packing_started_at?: string | null
          ready_for_handoff_at?: string | null
          ready_to_pack_at?: string | null
          sealed_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          handed_off_at?: string | null
          location_id?: string
          order_id?: string
          packing_started_at?: string | null
          ready_for_handoff_at?: string | null
          ready_to_pack_at?: string | null
          sealed_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_pass_orders_tenant_id_location_id_order_id_fkey"
            columns: ["tenant_id", "location_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      mealdeck_refund_allocations: {
        Row: {
          amount_pence: number
          created_at: string
          id: string
          location_id: string
          order_id: string
          provider_event_ref: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount_pence: number
          created_at?: string
          id?: string
          location_id: string
          order_id: string
          provider_event_ref?: string | null
          status: string
          tenant_id: string
        }
        Update: {
          amount_pence?: number
          created_at?: string
          id?: string
          location_id?: string
          order_id?: string
          provider_event_ref?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_refund_allocations_tenant_id_location_id_order_id_fkey"
            columns: ["tenant_id", "location_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          active: boolean
          brand_id: string
          id: string
          name: string
          slug: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_tenant_id_brand_id_fkey"
            columns: ["tenant_id", "brand_id"]
            isOneToOne: false
            referencedRelation: "tenant_brands"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_channel_rules: {
        Row: {
          channel_key: string
          location_id: string
          menu_item_id: string
          price_override_pence: number | null
          tenant_id: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          channel_key: string
          location_id: string
          menu_item_id: string
          price_override_pence?: number | null
          tenant_id: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          channel_key?: string
          location_id?: string
          menu_item_id?: string
          price_override_pence?: number | null
          tenant_id?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_channel_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_channel_rules_tenant_id_location_id_channel_key_fkey"
            columns: ["tenant_id", "location_id", "channel_key"]
            isOneToOne: false
            referencedRelation: "ordering_channels"
            referencedColumns: ["tenant_id", "location_id", "channel_key"]
          },
          {
            foreignKeyName: "menu_item_channel_rules_tenant_id_menu_item_id_fkey"
            columns: ["tenant_id", "menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      menu_item_modifier_groups: {
        Row: {
          group_id: string
          item_id: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          group_id: string
          item_id: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          group_id?: string
          item_id?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifier_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_tenant_id_group_id_fkey"
            columns: ["tenant_id", "group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_tenant_id_item_id_fkey"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      menu_item_station_routes: {
        Row: {
          item_id: string
          location_id: string
          prep_kind: string
          prep_seconds: number | null
          station_id: string
          tenant_id: string
        }
        Insert: {
          item_id: string
          location_id: string
          prep_kind?: string
          prep_seconds?: number | null
          station_id: string
          tenant_id: string
        }
        Update: {
          item_id?: string
          location_id?: string
          prep_kind?: string
          prep_seconds?: number | null
          station_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_station_routes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_station_routes_tenant_id_item_id_fkey"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "menu_item_station_routes_tenant_id_location_id_station_id_fkey"
            columns: ["tenant_id", "location_id", "station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          allergens: string[]
          brand_id: string
          category_id: string
          created_at: string
          description: string
          dietary: Json
          id: string
          image_url: string | null
          name: string
          price_pence: number
          sku: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          allergens?: string[]
          brand_id: string
          category_id: string
          created_at?: string
          description?: string
          dietary?: Json
          id?: string
          image_url?: string | null
          name: string
          price_pence: number
          sku?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          allergens?: string[]
          brand_id?: string
          category_id?: string
          created_at?: string
          description?: string
          dietary?: Json
          id?: string
          image_url?: string | null
          name?: string
          price_pence?: number
          sku?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_tenant_id_brand_id_category_id_fkey"
            columns: ["tenant_id", "brand_id", "category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["tenant_id", "brand_id", "id"]
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          id: string
          max_select: number
          min_select: number
          name: string
          tenant_id: string
        }
        Insert: {
          id?: string
          max_select?: number
          min_select?: number
          name: string
          tenant_id: string
        }
        Update: {
          id?: string
          max_select?: number
          min_select?: number
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_options: {
        Row: {
          active: boolean
          group_id: string
          id: string
          name: string
          price_delta_pence: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          group_id: string
          id?: string
          name: string
          price_delta_pence: number
          tenant_id: string
        }
        Update: {
          active?: boolean
          group_id?: string
          id?: string
          name?: string
          price_delta_pence?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_options_tenant_id_group_id_fkey"
            columns: ["tenant_id", "group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      order_items: {
        Row: {
          base_unit_price_pence: number | null
          brand_id: string
          checkout_line_id: string | null
          group_participant_id: string | null
          group_participant_name: string | null
          id: string
          item_name: string
          menu_item_id: string
          modifiers: Json
          notes: string | null
          order_id: string
          parent_checkout_line_id: string | null
          quantity: number
          tenant_id: string
          unit_price_pence: number
        }
        Insert: {
          base_unit_price_pence?: number | null
          brand_id: string
          checkout_line_id?: string | null
          group_participant_id?: string | null
          group_participant_name?: string | null
          id?: string
          item_name: string
          menu_item_id: string
          modifiers?: Json
          notes?: string | null
          order_id: string
          parent_checkout_line_id?: string | null
          quantity: number
          tenant_id: string
          unit_price_pence: number
        }
        Update: {
          base_unit_price_pence?: number | null
          brand_id?: string
          checkout_line_id?: string | null
          group_participant_id?: string | null
          group_participant_name?: string | null
          id?: string
          item_name?: string
          menu_item_id?: string
          modifiers?: Json
          notes?: string | null
          order_id?: string
          parent_checkout_line_id?: string | null
          quantity?: number
          tenant_id?: string
          unit_price_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_tenant_id_brand_id_menu_item_id_fkey"
            columns: ["tenant_id", "brand_id", "menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["tenant_id", "brand_id", "id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_order_id_fkey"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ordering_channels: {
        Row: {
          channel_key: string
          enabled: boolean
          fulfilment_modes: string[]
          location_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel_key: string
          enabled?: boolean
          fulfilment_modes?: string[]
          location_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel_key?: string
          enabled?: boolean
          fulfilment_modes?: string[]
          location_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordering_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordering_channels_tenant_id_location_id_fkey"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          cutlery_requested: boolean
          delivery_address: Json | null
          delivery_pence: number
          delivery_provider: string | null
          delivery_quote_ref: string | null
          fulfilment: Database["public"]["Enums"]["fulfilment_type"]
          group_order_room_id: string | null
          guest_checkout: boolean
          handoff_code: string | null
          handoff_code_reserved: boolean
          id: string
          location_id: string
          notes: string | null
          packing_plan: Json | null
          paid_at: string | null
          payment_reference: string | null
          payment_status: string
          review_confirmed_at: string | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_pence: number
          tenant_id: string
          total_pence: number
          vehicle: Json | null
          vehicle_registration: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          cutlery_requested?: boolean
          delivery_address?: Json | null
          delivery_pence?: number
          delivery_provider?: string | null
          delivery_quote_ref?: string | null
          fulfilment: Database["public"]["Enums"]["fulfilment_type"]
          group_order_room_id?: string | null
          guest_checkout?: boolean
          handoff_code?: string | null
          handoff_code_reserved?: boolean
          id?: string
          location_id: string
          notes?: string | null
          packing_plan?: Json | null
          paid_at?: string | null
          payment_reference?: string | null
          payment_status?: string
          review_confirmed_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_pence?: number
          tenant_id: string
          total_pence?: number
          vehicle?: Json | null
          vehicle_registration?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          cutlery_requested?: boolean
          delivery_address?: Json | null
          delivery_pence?: number
          delivery_provider?: string | null
          delivery_quote_ref?: string | null
          fulfilment?: Database["public"]["Enums"]["fulfilment_type"]
          group_order_room_id?: string | null
          guest_checkout?: boolean
          handoff_code?: string | null
          handoff_code_reserved?: boolean
          id?: string
          location_id?: string
          notes?: string | null
          packing_plan?: Json | null
          paid_at?: string | null
          payment_reference?: string | null
          payment_status?: string
          review_confirmed_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_pence?: number
          tenant_id?: string
          total_pence?: number
          vehicle?: Json | null
          vehicle_registration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_location_id_fkey"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "orders_tenant_id_location_id_group_order_room_id_fkey"
            columns: ["tenant_id", "location_id", "group_order_room_id"]
            isOneToOne: false
            referencedRelation: "group_order_rooms"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
      tenant_brands: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_locations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          tenant_id: string
          timezone: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          tenant_id: string
          timezone?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          tenant_id?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          id: string
          legal_name: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          legal_name: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          legal_name?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      hive_refund_allocations: {
        Row: {
          amount_pence: number | null
          created_at: string | null
          id: string | null
          location_id: string | null
          order_id: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          amount_pence?: number | null
          created_at?: string | null
          id?: string | null
          location_id?: string | null
          order_id?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount_pence?: number | null
          created_at?: string | null
          id?: string | null
          location_id?: string | null
          order_id?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mealdeck_refund_allocations_tenant_id_location_id_order_id_fkey"
            columns: ["tenant_id", "location_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "location_id", "id"]
          },
        ]
      }
    }
    Functions: {
      group_order_financial_ready: {
        Args: { p_room: string }
        Returns: boolean
      }
      mealdeck_accept_ordering_invitation: {
        Args: {
          p_actor_hash: string
          p_invite_hash: string
          p_name: string
          p_room: string
        }
        Returns: Json
      }
      mealdeck_begin_guest_session: {
        Args: {
          p_email: string
          p_location: string
          p_name: string
          p_phone: string
          p_tenant: string
          p_token_hash: string
        }
        Returns: Json
      }
      mealdeck_bind_order_payment: {
        Args: {
          p_account: string
          p_collection: string
          p_intent: string
          p_livemode: boolean
          p_session: string
          p_url: string
        }
        Returns: Json
      }
      mealdeck_bind_stripe_session: {
        Args: {
          p_account: string
          p_livemode: boolean
          p_order: string
          p_session: string
          p_url: string
        }
        Returns: boolean
      }
      mealdeck_cancel_cash_order_attempt: {
        Args: {
          p_actor: string
          p_attempt: string
          p_location: string
          p_quote: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_cancel_group_payment_room: {
        Args: { p_customer: string; p_guest_token_hash: string; p_room: string }
        Returns: Json
      }
      mealdeck_cancel_ordering_room: {
        Args: {
          p_actor_hash: string
          p_customer: string
          p_guest_token_hash: string
          p_room: string
        }
        Returns: Json
      }
      mealdeck_cancel_terminal_payment: {
        Args: {
          p_actor: string
          p_collection: string
          p_location: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_cash_order_status: {
        Args: {
          p_actor: string
          p_attempt: string
          p_location: string
          p_quote: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_checkout_status_for_customer: {
        Args: { p_customer: string; p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_close_ordering_invitations: {
        Args: { p_actor_hash: string; p_room: string }
        Returns: Json
      }
      mealdeck_confirm_cash_order: {
        Args: {
          p_actor: string
          p_attempt: string
          p_cash_received: boolean
          p_location: string
          p_quote: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_create_cash_quote: {
        Args: {
          p_actor: string
          p_customer_name: string
          p_customer_phone: string
          p_location: string
          p_notes: string
          p_packing: Json
          p_request_hash: string
          p_selection: Json
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_create_checkout_quote: {
        Args: {
          p_customer: string
          p_fulfilment: string
          p_location: string
          p_packing: Json
          p_request_hash: string
          p_selection: Json
          p_tenant: string
          p_vehicle: Json
        }
        Returns: Json
      }
      mealdeck_create_checkout_quote_with_notes: {
        Args: {
          p_customer: string
          p_fulfilment: string
          p_location: string
          p_notes: string
          p_packing: Json
          p_request_hash: string
          p_selection: Json
          p_tenant: string
          p_vehicle: Json
        }
        Returns: Json
      }
      mealdeck_create_group_payment_room: {
        Args: {
          p_attempt: string
          p_customer: string
          p_guest_token_hash: string
          p_livemode: boolean
          p_quote: string
          p_room: string
          p_share_tokens: Json
          p_split_mode: string
          p_stripe_account: string
        }
        Returns: Json
      }
      mealdeck_create_guest_checkout_quote: {
        Args: {
          p_fulfilment: string
          p_location: string
          p_packing: Json
          p_request_hash: string
          p_selection: Json
          p_tenant: string
          p_token_hash: string
          p_vehicle: Json
        }
        Returns: Json
      }
      mealdeck_create_guest_checkout_quote_with_notes: {
        Args: {
          p_fulfilment: string
          p_location: string
          p_notes: string
          p_packing: Json
          p_request_hash: string
          p_selection: Json
          p_tenant: string
          p_token_hash: string
          p_vehicle: Json
        }
        Returns: Json
      }
      mealdeck_create_ordering_room: {
        Args: {
          p_actor_hash: string
          p_attempt: string
          p_customer: string
          p_cutlery: boolean
          p_fulfilment: string
          p_guest_token_hash: string
          p_invites: Json
          p_location: string
          p_name: string
          p_payment_mode: string
          p_room: string
          p_tenant: string
          p_vehicle: Json
        }
        Returns: Json
      }
      mealdeck_create_terminal_quote: {
        Args: {
          p_actor: string
          p_fulfilment: string
          p_location: string
          p_packing: Json
          p_request_hash: string
          p_selection: Json
          p_tenant: string
          p_vehicle: Json
        }
        Returns: Json
      }
      mealdeck_customer_capabilities: { Args: never; Returns: Json }
      mealdeck_customer_export: { Args: never; Returns: Json }
      mealdeck_customer_has_push: {
        Args: { p_endpoint: string }
        Returns: Json
      }
      mealdeck_customer_order_receipt: {
        Args: { p_customer: string; p_order: string }
        Returns: Json
      }
      mealdeck_customer_orders: { Args: never; Returns: Json }
      mealdeck_customer_profile: { Args: never; Returns: Json }
      mealdeck_customer_register: {
        Args: {
          p_consent_version: string
          p_email_marketing: boolean
          p_name: string
          p_order_notifications: boolean
          p_phone: string
          p_privacy_version: string
          p_push_marketing: boolean
        }
        Returns: Json
      }
      mealdeck_customer_remove_push: {
        Args: { p_endpoint: string }
        Returns: Json
      }
      mealdeck_customer_save_push: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: Json
      }
      mealdeck_customer_update: {
        Args: {
          p_consent_version: string
          p_email_marketing: boolean
          p_expected_updated_at: string
          p_name: string
          p_order_notifications: boolean
          p_phone: string
          p_push_marketing: boolean
        }
        Returns: Json
      }
      mealdeck_end_guest_session: {
        Args: { p_location: string; p_tenant: string; p_token_hash: string }
        Returns: boolean
      }
      mealdeck_finalize_ordering_room: {
        Args: {
          p_actor_hash: string
          p_attempt: string
          p_customer: string
          p_expected_revision: number
          p_guest_token_hash: string
          p_livemode: boolean
          p_packing: Json
          p_request_hash: string
          p_room: string
          p_selection: Json
          p_share_tokens: Json
          p_stripe_account: string
        }
        Returns: Json
      }
      mealdeck_group_payment_collections: {
        Args: {
          p_customer: string
          p_guest_token_hash: string
          p_room: string
          p_share_token_hash: string
        }
        Returns: Json
      }
      mealdeck_group_payment_status: {
        Args: {
          p_customer: string
          p_guest_token_hash: string
          p_room: string
          p_share_token_hash: string
        }
        Returns: Json
      }
      mealdeck_guest_order_receipt: {
        Args: {
          p_location: string
          p_order: string
          p_tenant: string
          p_token_hash: string
        }
        Returns: Json
      }
      mealdeck_leave_ordering_room: {
        Args: { p_actor_hash: string; p_room: string }
        Returns: Json
      }
      mealdeck_online_checkout_status: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_ops_add_expense: {
        Args: {
          p_amount_pence: number
          p_category: string
          p_date: string
          p_location: string
          p_note: string
          p_tenant: string
        }
        Returns: string
      }
      mealdeck_ops_advance_purchase: {
        Args: {
          p_action: string
          p_location: string
          p_order: string
          p_tenant: string
        }
        Returns: boolean
      }
      mealdeck_ops_analytics: {
        Args: {
          p_from: string
          p_location: string
          p_tenant: string
          p_to: string
        }
        Returns: Json
      }
      mealdeck_ops_assign_staff: {
        Args: {
          p_denies: string[]
          p_enabled: boolean
          p_grants: string[]
          p_location: string
          p_role: string
          p_tenant: string
          p_user: string
        }
        Returns: string
      }
      mealdeck_ops_audit_history: {
        Args: { p_limit?: number; p_tenant: string }
        Returns: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          event_id: number
          location_id: string
          next_value: Json
          previous_value: Json
        }[]
      }
      mealdeck_ops_batch_list: {
        Args: { p_days?: number; p_location: string; p_tenant: string }
        Returns: {
          batch_code: string
          batch_id: string
          expiry_kind: string
          expiry_on: string
          expiry_state: string
          ingredient_id: string
          ingredient_name: string
          issued_base_units: number
          received_base_units: number
          supplier_name: string
          tracked_balance: number
          unit: string
        }[]
      }
      mealdeck_ops_brand_sales: {
        Args: {
          p_from: string
          p_location: string
          p_tenant: string
          p_to: string
        }
        Returns: {
          brand_id: string
          brand_name: string
          item_count: number
          order_count: number
          recorded_goods_gross_pence: number
        }[]
      }
      mealdeck_ops_checkout_settings: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_ops_cost_list: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          base_unit: string
          cost_per_unit_pence: number
          effective_on: string
          ingredient_id: string
          ingredient_name: string
          supplier: string
        }[]
      }
      mealdeck_ops_create_invoice: {
        Args: {
          p_date: string
          p_due: string
          p_location: string
          p_net: number
          p_note: string
          p_number: string
          p_order: string
          p_tenant: string
          p_vat: number
        }
        Returns: string
      }
      mealdeck_ops_create_menu_item: {
        Args: {
          p_brand: string
          p_category: string
          p_description: string
          p_name: string
          p_price_pence: number
          p_tenant: string
        }
        Returns: string
      }
      mealdeck_ops_create_purchase: {
        Args: {
          p_location: string
          p_note: string
          p_supplier: string
          p_tenant: string
        }
        Returns: string
      }
      mealdeck_ops_create_supplier_credit: {
        Args: {
          p_invoice: string
          p_issued: string
          p_location: string
          p_net: number
          p_number: string
          p_reason: string
          p_tenant: string
          p_vat: number
        }
        Returns: string
      }
      mealdeck_ops_credit_action: {
        Args: {
          p_action: string
          p_credit: string
          p_location: string
          p_tenant: string
        }
        Returns: boolean
      }
      mealdeck_ops_credit_list: {
        Args: {
          p_from: string
          p_location: string
          p_tenant: string
          p_to: string
        }
        Returns: {
          created_by: string
          credit_id: string
          credit_number: string
          gross_pence: number
          invoice_id: string
          issued_on: string
          net_pence: number
          reason: string
          status: string
          vat_pence: number
        }[]
      }
      mealdeck_ops_expense_list: {
        Args: {
          p_from: string
          p_location: string
          p_tenant: string
          p_to: string
        }
        Returns: {
          amount_pence: number
          category: string
          expense_id: string
          note: string
          occurred_on: string
        }[]
      }
      mealdeck_ops_finance_summary: {
        Args: {
          p_from: string
          p_location: string
          p_tenant: string
          p_to: string
        }
        Returns: Json
      }
      mealdeck_ops_ingredient_list: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          active: boolean
          allergens: string[]
          base_unit: string
          ingredient_id: string
          name: string
          reorder_threshold: number
        }[]
      }
      mealdeck_ops_invoice_action: {
        Args: {
          p_action: string
          p_invoice: string
          p_location: string
          p_tenant: string
        }
        Returns: boolean
      }
      mealdeck_ops_invoice_line_list: {
        Args: { p_invoice: string; p_location: string; p_tenant: string }
        Returns: {
          base_quantity: number
          base_unit: string
          ingredient_name: string
          line_id: string
          net_pence: number
          po_quoted_net_pence: number
          po_received_quantity: number
          purchase_line_id: string
          tax_category: string
          vat_pence: number
        }[]
      }
      mealdeck_ops_invoice_list: {
        Args: {
          p_from: string
          p_location: string
          p_tenant: string
          p_to: string
        }
        Returns: {
          approved_at: string
          created_by: string
          declared_gross_pence: number
          declared_net_pence: number
          declared_vat_pence: number
          due_date: string
          invoice_date: string
          invoice_id: string
          invoice_number: string
          line_count: number
          purchase_order_id: string
          status: string
          supplier_name: string
          tax_document_reviewed: boolean
        }[]
      }
      mealdeck_ops_invoice_summary: {
        Args: {
          p_from: string
          p_location: string
          p_tenant: string
          p_to: string
        }
        Returns: Json
      }
      mealdeck_ops_issue_batch: {
        Args: {
          p_batch: string
          p_location: string
          p_note: string
          p_quantity: number
          p_reason: string
          p_reference: string
          p_tenant: string
        }
        Returns: string
      }
      mealdeck_ops_kds_accept_order: {
        Args: {
          p_expected_version: string
          p_location: string
          p_order: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_kds_board: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_ops_kds_board_v2: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_ops_kds_complete_handoff: {
        Args: {
          p_code: string
          p_expected_version: string
          p_location: string
          p_order: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_kds_set_item_ready: {
        Args: {
          p_expected_version: string
          p_item: string
          p_location: string
          p_order: string
          p_ready: boolean
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_kds_transition_order: {
        Args: {
          p_expected_version: string
          p_location: string
          p_order: string
          p_status: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_kds_transition_pass: {
        Args: {
          p_expected_version: string
          p_location: string
          p_order: string
          p_status: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_kds_workflow_board: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_ops_kitchen_stations: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          station_code: string
          station_id: string
          station_name: string
        }[]
      }
      mealdeck_ops_locations: {
        Args: { p_tenant: string }
        Returns: {
          location_id: string
          location_name: string
        }[]
      }
      mealdeck_ops_menu_categories: {
        Args: { p_tenant: string }
        Returns: {
          active: boolean
          affected_item_count: number
          brand_id: string
          brand_name: string
          category_id: string
          category_name: string
        }[]
      }
      mealdeck_ops_menu_list: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          active: boolean
          allergens: string[]
          brand_id: string
          brand_name: string
          category_name: string
          description: string
          item_id: string
          item_name: string
          location_price_pence: number
          price_pence: number
          visible: boolean
        }[]
      }
      mealdeck_ops_menu_taxonomy: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          brand_id: string
          brand_name: string
          category_id: string
          category_name: string
        }[]
      }
      mealdeck_ops_modifier_prices: {
        Args: { p_tenant: string }
        Returns: {
          active: boolean
          affected_item_count: number
          group_id: string
          group_name: string
          option_id: string
          option_name: string
          price_delta_pence: number
        }[]
      }
      mealdeck_ops_modifier_update_option: {
        Args: {
          p_active: boolean
          p_expected_active: boolean
          p_expected_name: string
          p_expected_price_pence: number
          p_group: string
          p_name: string
          p_option: string
          p_price_pence: number
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_modifier_update_price: {
        Args: {
          p_expected_price_pence: number
          p_option: string
          p_price_pence: number
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_my_access: {
        Args: never
        Returns: {
          access_id: string
          deny_permissions: string[]
          grant_permissions: string[]
          location_id: string
          role: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      mealdeck_ops_order_history: {
        Args: {
          p_from: string
          p_location: string
          p_tenant: string
          p_to: string
        }
        Returns: {
          created_at: string
          fulfilment: string
          item_count: number
          order_id: string
          order_number: string
          paid_at: string
          source: string
          status: string
          total_pence: number
        }[]
      }
      mealdeck_ops_order_lines: {
        Args: { p_location: string; p_order: string; p_tenant: string }
        Returns: {
          brand_name: string
          item_id: string
          item_name: string
          modifiers: Json
          notes: string
          quantity: number
          unit_price_pence: number
        }[]
      }
      mealdeck_ops_purchase_lines_list: {
        Args: { p_location: string; p_order: string; p_tenant: string }
        Returns: {
          base_unit: string
          base_units_per_pack: number
          ingredient_id: string
          ingredient_name: string
          line_id: string
          pack_count: number
          price_per_pack_pence: number
          received_base_units: number
        }[]
      }
      mealdeck_ops_purchase_list: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          approved_at: string
          created_at: string
          created_by: string
          line_count: number
          note: string
          order_id: string
          quoted_total_pence: number
          received_line_count: number
          status: string
          supplier_name: string
        }[]
      }
      mealdeck_ops_receive_purchase: {
        Args: {
          p_base_qty: number
          p_batch_code: string
          p_delivery_ref: string
          p_expiry: string
          p_expiry_kind: string
          p_line: string
          p_location: string
          p_tenant: string
        }
        Returns: string
      }
      mealdeck_ops_recipe_costs: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          estimated_cost_pence: number
          menu_item_id: string
          menu_item_name: string
          missing_ingredient_costs: number
          recipe_version: number
        }[]
      }
      mealdeck_ops_recipe_list: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          brand_name: string
          ingredients: Json
          instructions: string
          item_name: string
          menu_item_id: string
          prep_minutes: number
          recipe_id: string
          updated_at: string
          version: number
          yield_units: number
        }[]
      }
      mealdeck_ops_record_ingredient_cost: {
        Args: {
          p_effective: string
          p_ingredient: string
          p_location: string
          p_supplier: string
          p_tenant: string
          p_unit_cost: number
        }
        Returns: string
      }
      mealdeck_ops_record_stock: {
        Args: {
          p_delta: number
          p_ingredient: string
          p_location: string
          p_note: string
          p_reason: string
          p_tenant: string
        }
        Returns: string
      }
      mealdeck_ops_review_invoice_tax: {
        Args: {
          p_invoice: string
          p_location: string
          p_reviewed: boolean
          p_tenant: string
        }
        Returns: boolean
      }
      mealdeck_ops_save_invoice_line: {
        Args: {
          p_invoice: string
          p_location: string
          p_net: number
          p_po_line: string
          p_quantity: number
          p_tax: string
          p_tenant: string
          p_vat: number
        }
        Returns: string
      }
      mealdeck_ops_save_purchase_line: {
        Args: {
          p_base_units: number
          p_ingredient: string
          p_location: string
          p_order: string
          p_pack_count: number
          p_pack_price: number
          p_tenant: string
        }
        Returns: string
      }
      mealdeck_ops_save_recipe: {
        Args: {
          p_ingredients: Json
          p_instructions: string
          p_item: string
          p_prep: number
          p_tenant: string
          p_yield: number
        }
        Returns: string
      }
      mealdeck_ops_save_supplier: {
        Args: {
          p_email: string
          p_id: string
          p_lead_days: number
          p_name: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      mealdeck_ops_set_menu_visibility: {
        Args: {
          p_item: string
          p_location: string
          p_tenant: string
          p_visible: boolean
        }
        Returns: boolean
      }
      mealdeck_ops_set_station_route: {
        Args: {
          p_enabled: boolean
          p_item: string
          p_location: string
          p_station: string
          p_tenant: string
        }
        Returns: boolean
      }
      mealdeck_ops_staff_list: {
        Args: { p_tenant: string }
        Returns: {
          access_id: string
          created_at: string
          deny_permissions: string[]
          enabled: boolean
          grant_permissions: string[]
          location_id: string
          role: string
          user_email: string
          user_id: string
        }[]
      }
      mealdeck_ops_stock_levels: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          base_unit: string
          ingredient_id: string
          name: string
          quantity: number
          reorder_threshold: number
        }[]
      }
      mealdeck_ops_supplier_list: {
        Args: { p_location: string; p_tenant: string }
        Returns: {
          contact_email: string
          lead_time_days: number
          name: string
          status: string
          supplier_id: string
        }[]
      }
      mealdeck_ops_update_checkout_availability: {
        Args: {
          p_collection_estimate_minutes: number
          p_location: string
          p_state: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_update_checkout_settings: {
        Args: {
          p_collection_estimate_minutes: number
          p_enabled: boolean
          p_location: string
          p_opening_start_date: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_update_collection_estimate: {
        Args: {
          p_collection_estimate_minutes: number
          p_location: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_update_menu_category: {
        Args: {
          p_active: boolean
          p_brand: string
          p_category: string
          p_expected_active: boolean
          p_expected_name: string
          p_name: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_ops_update_menu_item: {
        Args: {
          p_active: boolean
          p_description: string
          p_item: string
          p_name: string
          p_price_pence: number
          p_tenant: string
        }
        Returns: boolean
      }
      mealdeck_ops_upsert_ingredient: {
        Args: {
          p_allergens: string[]
          p_id: string
          p_name: string
          p_reorder: number
          p_tenant: string
          p_unit: string
        }
        Returns: string
      }
      mealdeck_order_payment_collection: {
        Args: { p_account: string; p_collection: string; p_livemode: boolean }
        Returns: Json
      }
      mealdeck_ordering_invitation: {
        Args: { p_invite_hash: string; p_room: string }
        Returns: Json
      }
      mealdeck_ordering_payment_access: {
        Args: {
          p_actor_hash: string
          p_cover_remaining: boolean
          p_customer: string
          p_guest_token_hash: string
          p_room: string
        }
        Returns: Json
      }
      mealdeck_ordering_payment_collections: {
        Args: {
          p_actor_hash: string
          p_customer: string
          p_guest_token_hash: string
          p_room: string
        }
        Returns: Json
      }
      mealdeck_ordering_payment_status: {
        Args: { p_actor_hash: string; p_room: string }
        Returns: Json
      }
      mealdeck_ordering_room_status: {
        Args: { p_actor_hash: string; p_room: string }
        Returns: Json
      }
      mealdeck_prepare_group_payment: {
        Args: {
          p_attempt: string
          p_cover_remaining: boolean
          p_customer: string
          p_guest_token_hash: string
          p_livemode: boolean
          p_room: string
          p_share_token_hash: string
          p_stripe_account: string
        }
        Returns: Json
      }
      mealdeck_prepare_guest_stripe_order: {
        Args: {
          p_attempt: string
          p_livemode: boolean
          p_location: string
          p_quote: string
          p_stripe_account: string
          p_tenant: string
          p_token_hash: string
        }
        Returns: Json
      }
      mealdeck_prepare_stripe_order: {
        Args: {
          p_attempt: string
          p_customer: string
          p_livemode: boolean
          p_quote: string
          p_stripe_account: string
        }
        Returns: Json
      }
      mealdeck_prepare_terminal_payment: {
        Args: {
          p_actor: string
          p_attempt: string
          p_livemode: boolean
          p_location: string
          p_order: string
          p_quote: string
          p_stripe_account: string
          p_tenant: string
          p_terminal_location: string
        }
        Returns: Json
      }
      mealdeck_printer_accept_order: {
        Args: {
          p_expected_version: string
          p_location: string
          p_order: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_printer_acceptance_board: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_printer_access_list: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_printer_assign_access: {
        Args: {
          p_email: string
          p_enabled: boolean
          p_location: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_printer_begin_send: {
        Args: {
          p_claim: string
          p_job: string
          p_location: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_printer_board: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_printer_claim_contact: {
        Args: { p_claim: string; p_job: string }
        Returns: Json
      }
      mealdeck_printer_claim_job: {
        Args: {
          p_job: string
          p_location: string
          p_tenant: string
          p_terminal: string
        }
        Returns: Json
      }
      mealdeck_printer_claim_receipt: {
        Args: { p_claim: string; p_job: string }
        Returns: Json
      }
      mealdeck_printer_confirm_paper: {
        Args: {
          p_job: string
          p_location: string
          p_outcome: string
          p_reason: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_printer_my_access: { Args: never; Returns: Json }
      mealdeck_printer_reprint: {
        Args: {
          p_job: string
          p_location: string
          p_reason: string
          p_request: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_printer_send_result: {
        Args: {
          p_claim: string
          p_job: string
          p_location: string
          p_outcome: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_public_launch_catalogue: {
        Args: {
          p_location: string
          p_replacement_options: string[]
          p_skus: string[]
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_public_menu: { Args: never; Returns: Json }
      mealdeck_push_campaign_cancel: {
        Args: { p_campaign: string; p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_push_campaign_confirm: {
        Args: { p_campaign: string; p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_push_campaign_list: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_push_campaign_prepare: {
        Args: {
          p_body: string
          p_expires_at: string
          p_location: string
          p_path: string
          p_tenant: string
          p_title: string
        }
        Returns: Json
      }
      mealdeck_push_claim: {
        Args: { p_limit?: number; p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_push_finish: {
        Args: {
          p_job: string
          p_lease: string
          p_location: string
          p_outcome: string
          p_status?: number
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_push_order_subscription: {
        Args: {
          p_action: string
          p_actor: string
          p_auth?: string
          p_endpoint: string
          p_guest_hash: string
          p_location: string
          p_order: string
          p_p256dh?: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_push_preflight: {
        Args: {
          p_job: string
          p_lease: string
          p_location: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_push_runtime_config: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_push_worker_seen: {
        Args: { p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_reconcile_order_payment: {
        Args: {
          p_account: string
          p_captured: number
          p_collection: string
          p_currency: string
          p_disputed: boolean
          p_event: string
          p_hash: string
          p_intent: string
          p_livemode: boolean
          p_order: string
          p_refunded: number
          p_session: string
          p_type: string
        }
        Returns: Json
      }
      mealdeck_reconcile_stripe_event: {
        Args: {
          p_account: string
          p_captured: number
          p_currency: string
          p_disputed: boolean
          p_event: string
          p_hash: string
          p_intent: string
          p_livemode: boolean
          p_order: string
          p_refunded: number
          p_session: string
          p_type: string
        }
        Returns: Json
      }
      mealdeck_remove_ordering_invitation: {
        Args: { p_actor_hash: string; p_participant: string; p_room: string }
        Returns: Json
      }
      mealdeck_resolve_guest_session: {
        Args: { p_location: string; p_tenant: string; p_token_hash: string }
        Returns: Json
      }
      mealdeck_set_ordering_ready: {
        Args: {
          p_actor_hash: string
          p_expected_version: number
          p_ready: boolean
          p_room: string
        }
        Returns: Json
      }
      mealdeck_terminal_authorize: {
        Args: { p_actor: string; p_location: string; p_tenant: string }
        Returns: Json
      }
      mealdeck_terminal_order_status: {
        Args: {
          p_actor: string
          p_location: string
          p_reference: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_terminal_payment_attempt: {
        Args: {
          p_actor: string
          p_attempt: string
          p_location: string
          p_tenant: string
        }
        Returns: Json
      }
      mealdeck_update_ordering_choices: {
        Args: {
          p_actor_hash: string
          p_expected_version: number
          p_picks: Json
          p_room: string
        }
        Returns: Json
      }
    }
    Enums: {
      fulfilment_type: "pickup" | "curbside" | "delivery" | "dine_in"
      order_status:
        | "draft"
        | "payment_pending"
        | "paid"
        | "authorised_tab"
        | "accepted"
        | "preparing"
        | "ready"
        | "fulfilled"
        | "cancelled"
        | "refunded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      fulfilment_type: ["pickup", "curbside", "delivery", "dine_in"],
      order_status: [
        "draft",
        "payment_pending",
        "paid",
        "authorised_tab",
        "accepted",
        "preparing",
        "ready",
        "fulfilled",
        "cancelled",
        "refunded",
      ],
    },
  },
} as const
