import React from 'react';
import { IconInfo } from '../icons';

export function DataUnavailableNotice({
  title,
  reason,
  detail,
}: {
  title: string;
  reason: string;
  detail?: string;
}) {
  return (
    <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900">
      <div className="flex items-start gap-2.5">
        <IconInfo className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold text-amber-950">{title}</div>
          <div className="text-amber-800 mt-0.5 font-medium">{reason}</div>
          {detail && <div className="text-amber-700/80 mt-1 leading-relaxed">{detail}</div>}
        </div>
      </div>
    </div>
  );
}
