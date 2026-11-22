"""Payment providers for plan purchases.

Only a mock provider exists for now: it approves every payment without charging anyone.
A real provider implements ``PaymentProvider`` and is returned from ``get_payment_provider``.
"""
import uuid
from dataclasses import dataclass
from typing import Protocol

from app.core.config import settings


@dataclass(frozen=True)
class PaymentResult:
    paid: bool
    reference: str | None = None


class PaymentProvider(Protocol):
    name: str

    def charge(self, *, user_id: uuid.UUID, plan_code: str, amount_uah: int) -> PaymentResult: ...


class MockPaymentProvider:
    name = "mock"

    def charge(self, *, user_id: uuid.UUID, plan_code: str, amount_uah: int) -> PaymentResult:
        return PaymentResult(paid=True, reference=f"mock-{uuid.uuid4().hex}")


def get_payment_provider() -> PaymentProvider:
    if settings.payment_provider == "mock":
        return MockPaymentProvider()
    raise RuntimeError(f"Unknown payment provider: {settings.payment_provider}")
