import { useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  HOSTEL_BUILDINGS,
  hostelName,
  parseHostelName,
  type HostelCategory,
} from '../../../server/hostel-locations'

export function HostelLocationFields({
  value,
  onChange,
  prefix,
}: {
  value: string
  onChange: (value: string) => void
  prefix: string
}) {
  const parsed = parseHostelName(value)
  const [draftCategory, setDraftCategory] = useState<HostelCategory | ''>('')
  const category = draftCategory || parsed?.category || ''
  return (
    <div className='flex flex-wrap gap-3'>
      <div className='min-w-40 flex-1 space-y-1'>
        <Label htmlFor={`${prefix}-hostel-category`}>Hostel</Label>
        <Select
          value={category}
          onValueChange={(entry) => {
            setDraftCategory(entry as HostelCategory)
            onChange('')
          }}
        >
          <SelectTrigger id={`${prefix}-hostel-category`} className='w-full'>
            <SelectValue placeholder='Boys or Girls Hostel' />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(HOSTEL_BUILDINGS) as HostelCategory[]).map(
              (entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>
      <div className='min-w-40 flex-1 space-y-1'>
        <Label htmlFor={`${prefix}-hostel-building`}>Building</Label>
        <Select
          value={parsed?.category === category ? parsed.building : ''}
          disabled={!category}
          onValueChange={(building) =>
            onChange(hostelName(category as HostelCategory, building))
          }
        >
          <SelectTrigger id={`${prefix}-hostel-building`} className='w-full'>
            <SelectValue placeholder='Choose building' />
          </SelectTrigger>
          <SelectContent>
            {category &&
              HOSTEL_BUILDINGS[category].map((building) => (
                <SelectItem key={building} value={building}>
                  {building}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      {value && !parsed && (
        <p className='w-full text-xs text-muted-foreground'>
          Existing location: {value}. Choose a listed hostel to change it.
        </p>
      )}
    </div>
  )
}
