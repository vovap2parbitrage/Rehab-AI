from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0003'
down_revision: str | Sequence[str] | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'exercises',
        sa.Column('body_parts', sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.alter_column('exercises', 'body_parts', server_default=None)

    op.add_column('sessions', sa.Column('comparison_task_id', sa.String(length=64), nullable=True))
    op.create_unique_constraint(
        'uq_sessions_comparison_task_id', 'sessions', ['comparison_task_id']
    )


def downgrade() -> None:
    op.drop_constraint('uq_sessions_comparison_task_id', 'sessions', type_='unique')
    op.drop_column('sessions', 'comparison_task_id')
    op.drop_column('exercises', 'body_parts')
