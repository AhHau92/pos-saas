import { Card, EmptyState } from "@/components/ui/primitives";

export function NoAccess() {
  return (
    <Card>
      <EmptyState title="You don't have access to this page">Ask the shop owner if you need it.</EmptyState>
    </Card>
  );
}
