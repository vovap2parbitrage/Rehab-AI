"""own authentication instead of Keycloak

Deletes every account (they lived in Keycloak and have no passwords here) together with
everything that depends on them, then replaces the Keycloak columns with a password hash,
drops the admin role and adds ``refresh_tokens``. The ``plans`` catalog is kept.

The deleted data is not restored by the downgrade.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-28 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0014'
down_revision: str | Sequence[str] | None = '0013'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute('TRUNCATE TABLE users CASCADE')

    op.drop_index(op.f('ix_users_keycloak_sub'), table_name='users')
    op.drop_column('users', 'keycloak_sub')
    op.drop_constraint('ck_users_pending_role', 'users', type_='check')
    op.drop_column('users', 'pending_role')
    op.drop_column('users', 'is_verified')

    op.add_column('users', sa.Column('password_hash', sa.String(length=255), nullable=False))
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))

    op.drop_constraint('ck_users_role', 'users', type_='check')
    op.create_check_constraint('ck_users_role', 'users', "role IN ('patient', 'therapist')")

    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('family_id', sa.Uuid(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('family_expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('rotated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_family_id'), 'refresh_tokens', ['family_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_refresh_tokens_family_id'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')

    op.drop_constraint('ck_users_role', 'users', type_='check')
    op.create_check_constraint('ck_users_role', 'users', "role IN ('patient', 'therapist', 'admin')")

    op.drop_column('users', 'password_changed_at')
    op.drop_column('users', 'password_hash')

    op.add_column(
        'users',
        sa.Column('is_verified', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.alter_column('users', 'is_verified', server_default=None)
    op.add_column('users', sa.Column('pending_role', sa.String(length=20), nullable=True))
    op.create_check_constraint(
        'ck_users_pending_role',
        'users',
        "pending_role IS NULL OR pending_role IN ('patient', 'therapist')",
    )
    op.add_column('users', sa.Column('keycloak_sub', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_users_keycloak_sub'), 'users', ['keycloak_sub'], unique=True)
