"""replace assignment dates and frequency with duration and weekdays

Revision ID: 0003
Revises: 0002
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("assignments")}
    if "duration_weeks" in columns:
        return

    op.add_column(
        "assignments",
        sa.Column("duration_weeks", sa.Integer(), nullable=True),
    )
    op.add_column(
        "assignments",
        sa.Column("weekdays", sa.JSON(), nullable=True),
    )
    op.execute(
        """
        UPDATE assignments
        SET duration_weeks = GREATEST(
                1,
                CEIL(
                    (COALESCE(ends_on, starts_on + 6) - starts_on + 1)
                    / 7.0
                )
            )::integer,
            weekdays = (
                SELECT json_agg(day)
                FROM generate_series(0, sessions_per_week - 1) AS day
            )
        """
    )
    op.alter_column("assignments", "duration_weeks", nullable=False)
    op.alter_column("assignments", "weekdays", nullable=False)
    op.drop_constraint("ck_assignments_date_range", "assignments", type_="check")
    op.drop_constraint(
        "ck_assignments_sessions_per_week_range",
        "assignments",
        type_="check",
    )
    op.create_check_constraint(
        "ck_assignments_duration_weeks_positive",
        "assignments",
        "duration_weeks > 0",
    )
    op.drop_column("assignments", "ends_on")
    op.drop_column("assignments", "sessions_per_week")


def downgrade() -> None:
    op.add_column("assignments", sa.Column("sessions_per_week", sa.Integer(), nullable=True))
    op.add_column("assignments", sa.Column("ends_on", sa.Date(), nullable=True))
    op.execute(
        """
        UPDATE assignments
        SET sessions_per_week = json_array_length(weekdays),
            ends_on = starts_on + (duration_weeks * 7 - 1)
        """
    )
    op.alter_column("assignments", "sessions_per_week", nullable=False)
    op.drop_constraint("ck_assignments_duration_weeks_positive", "assignments", type_="check")
    op.create_check_constraint(
        "ck_assignments_date_range",
        "assignments",
        "ends_on IS NULL OR ends_on >= starts_on",
    )
    op.create_check_constraint(
        "ck_assignments_sessions_per_week_range",
        "assignments",
        "sessions_per_week BETWEEN 1 AND 14",
    )
    op.drop_column("assignments", "weekdays")
    op.drop_column("assignments", "duration_weeks")
