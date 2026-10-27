import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatServiceOption } from './format'
import { type Service } from './types'

export function ServicePicker({
  services,
  value,
  onChange,
  activeOnly = false,
  label = 'Service',
}: {
  services: Service[]
  value: string
  onChange: (id: string) => void
  activeOnly?: boolean
  label?: string
}) {
  const available = activeOnly
    ? services.filter((service) => service.status === 'CHECKIN_OPEN')
    : services
  return (
    <div className='space-y-1.5'>
      <Label
        htmlFor='service-picker'
        className='text-xs font-medium text-muted-foreground'
      >
        {label}
      </Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id='service-picker' className='w-full sm:w-80'>
          <SelectValue
            placeholder={
              available.length
                ? 'Choose a service'
                : activeOnly
                  ? 'No open service right now'
                  : 'No services scheduled'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {available.map((service) => (
            <SelectItem key={service.id} value={service.id}>
              {formatServiceOption(service)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
