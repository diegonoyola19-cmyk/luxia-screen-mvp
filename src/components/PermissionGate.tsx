import type { ReactNode } from 'react';
import { useAuthStore } from '../store/useAuthStore';

interface PermissionGateProps {
  permission?: string;
  anyOf?: string[];
  allOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate({
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: PermissionGateProps) {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const hasAnyPermission = useAuthStore((state) => state.hasAnyPermission);

  const passesPermission = permission ? hasPermission(permission) : true;
  const passesAnyOf = anyOf && anyOf.length > 0 ? hasAnyPermission(anyOf) : true;
  const passesAllOf = allOf && allOf.length > 0 ? allOf.every((item) => hasPermission(item)) : true;

  if (!passesPermission || !passesAnyOf || !passesAllOf) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
