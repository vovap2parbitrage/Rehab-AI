"""doctor plans: limit of active patients per therapist

Adds ``plans`` (with the starting plans), ``users.plan_code`` (every user starts on
``free``) and ``plan_payments``, the audit trail of plan purchases.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-23 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0007'
down_revision: str | Sequence[str] | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    plans = op.create_table(
        'plans',
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('max_active_patients', sa.Integer(), nullable=False),
        sa.Column('price_uah', sa.Integer(), nullable=False),
        sa.CheckConstraint(
            'max_active_patients > 0', name='ck_plans_max_active_patients_positive'
        ),
        sa.CheckConstraint('price_uah >= 0', name='ck_plans_price_not_negative'),
        sa.PrimaryKeyConstraint('code'),
    )
    op.bulk_insert(
        plans,
        [
            {'code': 'free', 'name': 'Безкоштовний', 'max_active_patients': 5, 'price_uah': 0},
            {'code': 'standard', 'name': 'Стандарт', 'max_active_patients': 15, 'price_uah': 499},
            {'code': 'pro', 'name': 'Професійний', 'max_active_patients': 30, 'price_uah': 899},
        ],
    )

    op.add_column(
        'users',
        sa.Column('plan_code', sa.String(length=20), server_default='free', nullable=False),
    )
    op.create_foreign_key('fk_users_plan_code_plans', 'users', 'plans', ['plan_code'], ['code'])

    op.create_table(
        'plan_payments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('plan_code', sa.String(length=20), nullable=False),
        sa.Column('amount_uah', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('provider', sa.String(length=30), nullable=False),
        sa.Column('provider_reference', sa.String(length=100), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("status IN ('paid', 'failed')", name='ck_plan_payments_status'),
        sa.ForeignKeyConstraint(['plan_code'], ['plans.code']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_plan_payments_user_id'), 'plan_payments', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_plan_payments_user_id'), table_name='plan_payments')
    op.drop_table('plan_payments')
    op.drop_constraint('fk_users_plan_code_plans', 'users', type_='foreignkey')
    op.drop_column('users', 'plan_code')
    op.drop_table('plans')
