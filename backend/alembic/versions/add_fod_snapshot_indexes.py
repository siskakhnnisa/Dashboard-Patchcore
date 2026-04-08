"""add_fod_snapshot_indexes

Revision ID: a1b2c3d4e5f6
Revises: 7ba80f0c59ff
Create Date: 2026-04-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '7ba80f0c59ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_fod_snapshots_created_at', 'fod_snapshots', ['created_at'])
    op.create_index('ix_fod_snapshots_validation_status', 'fod_snapshots', ['validation_status'])
    op.create_index('ix_fod_snapshots_video_id', 'fod_snapshots', ['video_id'])


def downgrade() -> None:
    op.drop_index('ix_fod_snapshots_video_id', table_name='fod_snapshots')
    op.drop_index('ix_fod_snapshots_validation_status', table_name='fod_snapshots')
    op.drop_index('ix_fod_snapshots_created_at', table_name='fod_snapshots')
