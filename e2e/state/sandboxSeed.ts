export interface SandboxUser {
  id: string;
  email: string;
  role: 'admin' | 'produccion' | 'bodega' | 'consulta';
  role_id: string;
  is_active: boolean;
}

export interface SandboxProfile {
  id: string;
  email: string;
  role: 'admin' | 'produccion' | 'bodega' | 'consulta';
  role_id: string;
  is_active: boolean;
  created_at: string;
}

export interface SandboxRolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  permission_key: string;
}

export interface SandboxInventoryItem {
  id: string;
  code: string;
  category: 'fabric' | 'tube' | 'bottom' | 'component';
  kind: 'roll' | 'scrap' | 'bar' | 'unit';
  status: 'available' | 'reserved' | 'used' | 'deleted';
  payload: Record<string, any>;
  source: 'vertilux_api' | 'manual' | 'scrap';
  created_at: string;
  updated_at: string;
}

export interface SandboxInventoryMovement {
  id: string;
  item_id: string;
  order_id?: string | null;
  action: 'consume' | 'rollback' | 'create_scrap' | 'discard_scrap' | 'adjust' | 'use_scrap';
  quantity: number;
  unit: string;
  user_id: string;
  notes?: string;
  created_at: string;
}

export interface SandboxWorkOrder {
  id: string;
  order_number: string;
  status: 'draft' | 'ready_for_production' | 'in_production' | 'materials_checked' | 'sent_to_sage' | 'completed' | 'cancelled';
  payload: Record<string, any>;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export const INITIAL_SANDBOX_USERS: Record<string, SandboxUser> = {
  'operador@luxia.com': {
    id: 'user-operador-001',
    email: 'operador@luxia.com',
    role: 'produccion',
    role_id: 'role-produccion',
    is_active: true,
  },
  'supervisor@luxia.com': {
    id: 'user-supervisor-001',
    email: 'supervisor@luxia.com',
    role: 'admin',
    role_id: 'role-admin',
    is_active: true,
  },
  'bodega@luxia.com': {
    id: 'user-bodega-001',
    email: 'bodega@luxia.com',
    role: 'bodega',
    role_id: 'role-bodega',
    is_active: true,
  },
  'admin@luxia.com': {
    id: 'user-admin-001',
    email: 'admin@luxia.com',
    role: 'admin',
    role_id: 'role-admin',
    is_active: true,
  },
  'consulta@luxia.com': {
    id: 'user-consulta-001',
    email: 'consulta@luxia.com',
    role: 'consulta',
    role_id: 'role-consulta',
    is_active: true,
  },
};

export const INITIAL_ROLE_PERMISSIONS: SandboxRolePermission[] = [
  // Admin permissions
  { id: 'rp-admin-all', role_id: 'role-admin', permission_id: 'p-all', permission_key: '*' },
  // Produccion permissions
  { id: 'rp-prod-1', role_id: 'role-produccion', permission_id: 'p-pv', permission_key: 'production.view' },
  { id: 'rp-prod-2', role_id: 'role-produccion', permission_id: 'p-pco', permission_key: 'production.create_order' },
  { id: 'rp-prod-3', role_id: 'role-produccion', permission_id: 'p-pab', permission_key: 'production.add_to_batch' },
  { id: 'rp-prod-4', role_id: 'role-produccion', permission_id: 'p-ov', permission_key: 'orders.view' },
  { id: 'rp-prod-5', role_id: 'role-produccion', permission_id: 'p-opdf', permission_key: 'orders.generate_pdf' },
  { id: 'rp-prod-6', role_id: 'role-produccion', permission_id: 'p-oe', permission_key: 'orders.edit' },
  { id: 'rp-prod-7', role_id: 'role-produccion', permission_id: 'p-iv', permission_key: 'inventory.view' },
  { id: 'rp-prod-8', role_id: 'role-produccion', permission_id: 'p-ic', permission_key: 'inventory.consume' },
  { id: 'rp-prod-9', role_id: 'role-produccion', permission_id: 'p-ia', permission_key: 'inventory.adjust' },
  // Bodega permissions
  { id: 'rp-bod-1', role_id: 'role-bodega', permission_id: 'p-iv', permission_key: 'inventory.view' },
  { id: 'rp-bod-2', role_id: 'role-bodega', permission_id: 'p-ic', permission_key: 'inventory.consume' },
  { id: 'rp-bod-3', role_id: 'role-bodega', permission_id: 'p-ia', permission_key: 'inventory.adjust' },
  { id: 'rp-bod-4', role_id: 'role-bodega', permission_id: 'p-ics', permission_key: 'inventory.create_scrap' },
  { id: 'rp-bod-5', role_id: 'role-bodega', permission_id: 'p-ids', permission_key: 'inventory.discard_scrap' },
  { id: 'rp-bod-6', role_id: 'role-bodega', permission_id: 'p-ie', permission_key: 'inventory.export' },
  // Consulta permissions
  { id: 'rp-con-1', role_id: 'role-consulta', permission_id: 'p-pv', permission_key: 'production.view' },
  { id: 'rp-con-2', role_id: 'role-consulta', permission_id: 'p-iv', permission_key: 'inventory.view' },
  { id: 'rp-con-3', role_id: 'role-consulta', permission_id: 'p-ov', permission_key: 'orders.view' },
  { id: 'rp-con-4', role_id: 'role-consulta', permission_id: 'p-opdf', permission_key: 'orders.generate_pdf' },
];

export function createInitialSandboxInventory(): SandboxInventoryItem[] {
  return [
    // Fabric virtual rolls (from API)
    {
      id: 'inv-roll-screen-1-white-250',
      code: '0-101-SC-01118',
      category: 'fabric',
      kind: 'roll',
      status: 'available',
      source: 'vertilux_api',
      payload: {
        family: 'Screen',
        openness: '1%',
        color: 'White',
        width_meters: 2.50,
        length_meters: 100.0,
        available_yd2: 300.0,
        isVirtualRoll: true,
        description: 'Screen 1% White 2.50m (98")',
        unit: 'YD',
      },
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'inv-roll-screen-3-white-250',
      code: '0-103-SC-01118',
      category: 'fabric',
      kind: 'roll',
      status: 'available',
      source: 'vertilux_api',
      payload: {
        family: 'Screen',
        openness: '3%',
        color: 'White',
        width_meters: 2.50,
        length_meters: 80.0,
        available_yd2: 240.0,
        isVirtualRoll: true,
        description: 'Screen 3% White 2.50m (98")',
        unit: 'YD',
      },
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'inv-roll-screen-1-grey-300',
      code: '0-101-SC-06118',
      category: 'fabric',
      kind: 'roll',
      status: 'available',
      source: 'vertilux_api',
      payload: {
        family: 'Screen',
        openness: '1%',
        color: 'Light Grey',
        width_meters: 3.00,
        length_meters: 120.0,
        available_yd2: 430.0,
        isVirtualRoll: true,
        description: 'Screen 1% Light Grey 3.00m (118")',
        unit: 'YD',
      },
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    // Available Scraps
    {
      id: 'inv-scrap-001',
      code: 'SCRAP-0-101-SC-01118-1',
      category: 'fabric',
      kind: 'scrap',
      status: 'available',
      source: 'scrap',
      payload: {
        family: 'Screen',
        openness: '1%',
        color: 'White',
        widthMeters: 1.20,
        heightMeters: 1.80,
        areaM2: 2.16,
        orderNumber: 'ORD-PREV-001',
        isVirtualRoll: false,
      },
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'inv-scrap-002-used',
      code: 'SCRAP-USED-BY-ORD2',
      category: 'fabric',
      kind: 'scrap',
      status: 'used',
      source: 'scrap',
      payload: {
        family: 'Screen',
        openness: '1%',
        color: 'White',
        widthMeters: 0.90,
        heightMeters: 1.50,
        areaM2: 1.35,
        orderNumber: 'ORD-TEST-002',
        isVirtualRoll: false,
      },
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    // Tubes
    {
      id: 'inv-tube-38-neo',
      code: '0-154-TU-38111',
      category: 'tube',
      kind: 'bar',
      status: 'available',
      source: 'vertilux_api',
      payload: {
        description: 'Tubo NEO 38 mm',
        unit: 'FT',
        available_quantity: 500,
        length_feet: 19,
      },
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'inv-tube-50',
      code: '0-154-TU-50001',
      category: 'tube',
      kind: 'bar',
      status: 'available',
      source: 'vertilux_api',
      payload: {
        description: 'Tubo 50 mm',
        unit: 'FT',
        available_quantity: 300,
        length_feet: 19,
      },
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    // Bottomrails
    {
      id: 'inv-bottomrail-white',
      code: '0-151-AL-CLW19',
      category: 'bottom',
      kind: 'bar',
      status: 'available',
      source: 'vertilux_api',
      payload: {
        description: 'Bottomrail Blanco 19ft',
        unit: 'FT',
        available_quantity: 400,
        length_feet: 19,
      },
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    // Components
    {
      id: 'inv-control-vtx30',
      code: '0-153-CA-001WH',
      category: 'component',
      kind: 'unit',
      status: 'available',
      source: 'vertilux_api',
      payload: {
        description: 'Control VTX30 Blanco',
        unit: 'EA',
        available_quantity: 250,
      },
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
}

export function createInitialSandboxOrders(): SandboxWorkOrder[] {
  return [
    {
      id: 'order-seed-001',
      order_number: 'ORD-2026-001',
      status: 'ready_for_production',
      user_id: 'user-operador-001',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 7200000).toISOString(),
      payload: {
        id: 'order-seed-001',
        orderNumber: 'ORD-2026-001',
        status: 'ready_for_production',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        items: [
          {
            id: 'item-seed-1',
            input: {
              widthMeters: 1.80,
              heightMeters: 2.20,
              fabricFamily: 'Screen',
              fabricOpenness: '1%',
              fabricColor: 'White',
              mountingSystem: 'standard',
              driveType: 'manual',
              hardwareTone: 'white',
            },
            result: {
              cutWidthMeters: 1.90,
              cutHeightMeters: 2.45,
              recommendedRollWidthMeters: 2.50,
              wastePercentage: 24.0,
              selectedFabric: {
                family: 'Screen',
                openness: '1%',
                color: 'White',
                itemCode: '0-101-SC-01118',
              },
            },
            materialLines: [
              { itemCode: '0-154-TU-38111', description: 'Tubo NEO 38 mm', quantity: 1.77, unit: 'm' },
              { itemCode: '0-151-AL-CLW19', description: 'Bottomrail Blanco', quantity: 1.77, unit: 'm' },
              { itemCode: '0-153-CA-001WH', description: 'Control VTX30 Blanco', quantity: 1, unit: 'EA' },
            ],
          },
        ],
      },
    },
    {
      id: 'order-seed-002',
      order_number: 'ORD-2026-002',
      status: 'in_production',
      user_id: 'user-operador-001',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      payload: {
        id: 'order-seed-002',
        orderNumber: 'ORD-2026-002',
        status: 'in_production',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        items: [
          {
            id: 'item-seed-2',
            input: {
              widthMeters: 2.00,
              heightMeters: 2.40,
              fabricFamily: 'Screen',
              fabricOpenness: '1%',
              fabricColor: 'White',
              mountingSystem: 'standard',
              driveType: 'manual',
              hardwareTone: 'white',
            },
            result: {
              cutWidthMeters: 2.10,
              cutHeightMeters: 2.65,
              recommendedRollWidthMeters: 2.50,
              wastePercentage: 16.0,
              selectedFabric: {
                family: 'Screen',
                openness: '1%',
                color: 'White',
                itemCode: '0-101-SC-01118',
              },
            },
            materialLines: [
              { itemCode: '0-154-TU-38111', description: 'Tubo NEO 38 mm', quantity: 1.97, unit: 'm' },
              { itemCode: '0-151-AL-CLW19', description: 'Bottomrail Blanco', quantity: 1.97, unit: 'm' },
              { itemCode: '0-153-CA-001WH', description: 'Control VTX30 Blanco', quantity: 1, unit: 'EA' },
            ],
          },
        ],
      },
    },
    {
      id: 'order-seed-003',
      order_number: 'ORD-2026-003',
      status: 'materials_checked',
      user_id: 'user-supervisor-001',
      created_at: new Date(Date.now() - 1800000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
      payload: {
        id: 'order-seed-003',
        orderNumber: 'ORD-2026-003',
        status: 'materials_checked',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
        items: [
          {
            id: 'item-seed-3',
            input: {
              widthMeters: 1.50,
              heightMeters: 1.80,
              fabricFamily: 'Screen',
              fabricOpenness: '3%',
              fabricColor: 'White',
              mountingSystem: 'standard',
              driveType: 'manual',
              hardwareTone: 'white',
            },
            result: {
              cutWidthMeters: 1.60,
              cutHeightMeters: 2.05,
              recommendedRollWidthMeters: 2.50,
              wastePercentage: 36.0,
              selectedFabric: {
                family: 'Screen',
                openness: '3%',
                color: 'White',
                itemCode: '0-103-SC-01118',
              },
            },
            materialLines: [
              { itemCode: '0-154-TU-38111', description: 'Tubo NEO 38 mm', quantity: 1.47, unit: 'm' },
              { itemCode: '0-151-AL-CLW19', description: 'Bottomrail Blanco', quantity: 1.47, unit: 'm' },
              { itemCode: '0-153-CA-001WH', description: 'Control VTX30 Blanco', quantity: 1, unit: 'EA' },
            ],
          },
        ],
      },
    },
  ];
}

export class SandboxState {
  users: Record<string, SandboxUser> = { ...INITIAL_SANDBOX_USERS };
  rolePermissions: SandboxRolePermission[] = [...INITIAL_ROLE_PERMISSIONS];
  inventory: SandboxInventoryItem[] = createInitialSandboxInventory();
  orders: SandboxWorkOrder[] = createInitialSandboxOrders();
  movements: SandboxInventoryMovement[] = [];
  activityLogs: Array<{ id: string; event_type: string; user_id?: string; metadata: any; created_at: string }> = [];
  activeSessionUser: SandboxUser | null = null;
  productionRequestsAttempted: string[] = [];

  reset() {
    this.users = { ...INITIAL_SANDBOX_USERS };
    this.rolePermissions = [...INITIAL_ROLE_PERMISSIONS];
    this.inventory = createInitialSandboxInventory();
    this.orders = createInitialSandboxOrders();
    this.movements = [];
    this.activityLogs = [];
    this.activeSessionUser = null;
    this.productionRequestsAttempted = [];
  }

  getPermissionsForRole(role: string): string[] {
    if (role === 'admin') {
      return [
        '*',
        'production.view',
        'production.create_order',
        'production.add_to_batch',
        'orders.view',
        'orders.generate_pdf',
        'orders.edit',
        'orders.cancel',
        'orders.export_sage',
        'inventory.view',
        'inventory.consume',
        'inventory.adjust',
        'inventory.create_scrap',
        'inventory.discard_scrap',
        'inventory.export',
        'settings.view',
        'users.view',
      ];
    }
    const matching = this.rolePermissions
      .filter((rp) => rp.role_id === `role-${role}`)
      .map((rp) => rp.permission_key);
    return matching.length > 0 ? matching : ['production.view', 'inventory.view', 'orders.view'];
  }
}

export const globalSandboxState = new SandboxState();
