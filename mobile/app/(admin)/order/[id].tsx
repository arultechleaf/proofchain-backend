import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { OrderInfo } from '../../../src/components/OrderInfo';
import { useApi } from '../../../src/hooks/useApi';
import { adminService } from '../../../src/services/admin.service';

/** An order as the administrator sees it: shop, customer and delivery person together. */
export default function AdminOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => adminService.order(orderId), [orderId]);
  return (
    <Screen back title={data?.orderNo ?? 'Order'} loading={loading} error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      {data ? <OrderInfo order={data} show={['shop', 'customer', 'worker']} /> : null}
    </Screen>
  );
}
