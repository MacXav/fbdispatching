import { Shipment } from '@/types';

interface PrintableBolProps {
  shipment: Shipment;
  bolNumber?: string;
  preview?: boolean;
}

export default function PrintableBol({
  shipment,
  bolNumber,
  preview = false,
}: PrintableBolProps) {
  const printedDate = new Date().toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });

  return (
    <div
      className={`mx-auto bg-white text-black ${
        preview ? 'max-w-[760px] text-[9px]' : 'text-[10px]'
      }`}
    >
      <div className="border border-black">
        <div className="grid grid-cols-[1fr_120px] border-b border-black">
          <div className="px-2 py-1 text-center">
            <h1 className="text-xl font-black uppercase tracking-wide">
              Bill of Lading / Original - Not Negotiable
            </h1>
          </div>

          <div className="border-l border-black px-2 py-1 text-right font-bold">
            Page: 1/1
          </div>
        </div>

        <div className="grid grid-cols-[1.05fr_0.95fr]">
          <div className="border-r border-black">
            <BolPartyBox
              title="Shipper / Expéditeur"
              companyName={shipment.pickup_company_name}
              address={shipment.pickup_address}
              city={shipment.pickup_city}
              postal={shipment.pickup_postal_code}
              contactName={shipment.pickup_contact_name}
              contactPhone={shipment.pickup_contact_phone}
            />

            <BolPartyBox
              title="Consignee / Destinataire"
              companyName={shipment.delivery_company_name}
              address={shipment.delivery_address}
              city={shipment.delivery_city}
              postal={shipment.delivery_postal_code}
              contactName={shipment.delivery_contact_name}
              contactPhone={shipment.delivery_contact_phone}
              borderedTop
            />

            <div className="min-h-[34px] border-t border-black px-2 py-1">
              <p className="text-[8px] font-bold">
                Notify Party / Partie notifiée
              </p>
              <p>{shipment.board_note || shipment.notes || ''}</p>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 border-b border-black">
              <div className="min-h-[38px] border-r border-black px-2 py-1">
                <p className="text-[8px] font-bold">Booking / Cust-Ref. #</p>
                <p className="font-bold">{getBoardDisplayName(shipment)}</p>
              </div>

              <div className="min-h-[38px] px-2 py-1">
                <p className="text-[8px] font-bold">Reference #</p>
                <p className="text-sm font-black">
                  {bolNumber || getDraftBolNumber(shipment)}
                </p>
              </div>
            </div>

            <div className="grid min-h-[145px] grid-cols-2 border-b border-black">
              <div className="flex items-center justify-center border-r border-black p-2 text-center">
                <div>
                  <p className="text-xl font-black uppercase tracking-widest">
                    Carrier
                  </p>
                  <p className="mt-1 text-sm font-black uppercase">
                    Dispatch Pro
                  </p>
                  <p className="mt-1 text-[9px] font-bold">Canadian Office</p>
                  <p className="text-[9px]">St. Catharines, ON</p>
                  <p className="mt-1 text-[9px]">Phone: __________________</p>
                </div>
              </div>

              <div className="p-2 text-center">
                <p className="text-[9px] font-black uppercase">
                  USA Warehouse
                </p>
                <p className="mt-2 text-[9px]">
                  __________________________________
                </p>
                <p className="mt-1 text-[9px]">
                  __________________________________
                </p>
                <p className="mt-1 text-[9px]">
                  __________________________________
                </p>
                <p className="mt-3 text-[9px]">Phone: __________________</p>
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <p className="text-[8px] font-bold">
                  Date of Issue / Date d&apos;origine
                </p>
                <p className="font-black uppercase">{printedDate}</p>
              </div>

              <div className="px-2 py-1">
                <p className="text-[8px] font-bold">Carrier / Transporteur</p>
                <p className="font-black uppercase">Dispatch Pro</p>
              </div>
            </div>

            <div className="min-h-[31px] px-2 py-1">
              <p className="text-[8px] font-bold">
                Terms of delivery &amp; payment / Conditions de livraison et de
                paiement
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-black px-2 py-1 text-[8px] leading-tight">
          <p>
            Received subject to the classification and tariffs in effect on the
            date of issue of this original bill of lading, the goods described
            below in apparent good order, except as noted. The carrier agrees to
            carry to its usual place of delivery at said destination, subject to
            all terms and conditions of the applicable tariffs and regulations.
          </p>
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="w-[72px] border border-black px-2 py-1 text-[8px]">
                No. of Pieces
              </th>
              <th className="w-[140px] border border-black px-2 py-1 text-[8px]">
                Type
              </th>
              <th className="border border-black px-2 py-1 text-[8px]">
                Description and Contents
              </th>
              <th className="w-[100px] border border-black px-2 py-1 text-right text-[8px]">
                Gross Weight
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className="h-[160px] border border-black px-2 py-2 align-top text-center text-sm font-black">
                {displayValue(shipment.number_of_skids, '')}
              </td>

              <td className="border border-black px-2 py-2 align-top text-sm font-black uppercase">
                {shipment.number_of_skids ? 'SKID(S)' : ''}
              </td>

              <td className="border border-black px-2 py-2 align-top text-sm font-black uppercase">
                {shipment.dimensions ? (
                  <>
                    <p>FREIGHT</p>
                    <p className="mt-2 text-[10px] font-bold normal-case">
                      Dimensions: {shipment.dimensions}
                    </p>
                  </>
                ) : (
                  'FREIGHT'
                )}

                {(shipment.board_note || shipment.notes) && (
                  <p className="mt-3 text-[10px] font-bold normal-case">
                    Note: {shipment.board_note || shipment.notes}
                  </p>
                )}
              </td>

              <td className="border border-black px-2 py-2 align-top text-right text-sm font-black">
                {getShipmentWeight(shipment)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-[0.95fr_1.25fr_0.95fr] border-t border-black">
          <div className="min-h-[84px] border-r border-black px-2 py-1 text-[8px]">
            <p className="text-[9px] font-black">Declared Valuation $</p>
            <p className="mt-2">
              Maximum liability $2.00 per pound unless declared valuation states
              otherwise.
            </p>
          </div>

          <div className="min-h-[84px] border-r border-black px-2 py-1 text-[8px] leading-tight">
            <p className="text-[9px] font-black">Notice Of Claim</p>
            <p className="mt-1">
              No carrier is liable for loss, damage or delay unless notice is
              submitted in writing within the required claim period. Final
              statement of claim must be filed with supporting documentation.
            </p>
          </div>

          <div className="min-h-[84px] px-2 py-1 text-[8px] leading-tight">
            <p>
              If this truck or trailer is delayed or detained, detention or
              demurrage will apply.
            </p>
            <p className="mt-2 font-bold">
              Any loss or damage must be noted by receiver on signature copy at
              time of delivery.
            </p>
          </div>
        </div>

        <div className="min-h-[120px] border-t border-black px-2 py-2">
          <p className="text-[9px] font-black italic">Remark / Remarque :</p>
          <p className="mt-2 whitespace-pre-wrap text-[10px]">
            {shipment.board_note || shipment.notes || ''}
          </p>
        </div>

        <div className="border-t border-black px-2 py-1 text-center text-[8px] leading-tight">
          All shipments are accepted subject to standard trading conditions.
          Toute cargaison est acceptée sous conditions commerciales standard.
        </div>

        <table className="w-full border-collapse text-center text-[9px]">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1">
                Shipper&apos;s Name &amp; Signature
              </td>
              <td className="w-[70px] border border-black px-2 py-1">
                Date
              </td>
              <td className="border border-black px-2 py-1">
                Driver&apos;s Name &amp; Signature
              </td>
              <td className="w-[70px] border border-black px-2 py-1">
                Date
              </td>
              <td className="border border-black px-2 py-1">
                Consignee&apos;s Name &amp; Signature
              </td>
              <td className="w-[70px] border border-black px-2 py-1">
                Date
              </td>
            </tr>

            <tr>
              <td className="h-[34px] border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BolPartyBox({
  title,
  companyName,
  address,
  city,
  postal,
  contactName,
  contactPhone,
  borderedTop = false,
}: {
  title: string;
  companyName?: string | null;
  address?: string | null;
  city?: string | null;
  postal?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  borderedTop?: boolean;
}) {
  return (
    <div
      className={`min-h-[111px] px-2 py-1 ${
        borderedTop ? 'border-t border-black' : ''
      }`}
    >
      <p className="text-[8px] font-bold">{title}</p>

      <p className="mt-1 text-sm font-black uppercase">
        {displayValue(companyName)}
      </p>

      <p className="mt-1 text-[11px] font-bold uppercase">
        {address || 'ADDRESS UNKNOWN'}
      </p>

      <p className="text-[11px] font-bold uppercase">
        {[city, postal].filter(Boolean).join(', ') || 'CITY / POSTAL UNKNOWN'}
      </p>

      {(contactName || contactPhone) && (
        <p className="mt-1 text-[10px] font-bold">
          {contactName ? `${contactName} ` : ''}
          {contactPhone ? `T: ${contactPhone}` : ''}
        </p>
      )}
    </div>
  );
}

export function getDraftBolNumber(shipment: Shipment) {
  return `DRAFT-${shipment.id.slice(0, 8).toUpperCase()}`;
}

export function getBoardDisplayName(shipment: Shipment) {
  if (shipment.board_name && shipment.board_name.trim() !== '') {
    return shipment.board_name;
  }

  const stopType = shipment.board_stop_type || 'delivery';

  if (
    stopType === 'pickup' ||
    stopType === 'pickup_and_delivery' ||
    stopType === 'warehouse'
  ) {
    return shipment.pickup_company_name || shipment.delivery_company_name || 'Unknown';
  }

  if (stopType === 'cross_dock') {
    return shipment.pickup_company_name || shipment.delivery_company_name || 'Cross Dock';
  }

  return shipment.delivery_company_name || shipment.pickup_company_name || 'Unknown';
}

export function getShipmentWeight(shipment: Shipment) {
  const weight = shipment.weight_lbs || shipment.weight_kg || null;

  if (!weight) {
    return '';
  }

  return `${Number(weight).toLocaleString()} lbs`;
}

export function displayValue(value?: string | number | null, fallback = 'Unknown') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return value;
}

export function displayLocation(
  address?: string | null,
  city?: string | null,
  postal?: string | null
) {
  const parts = [address, city, postal].filter(
    (part) => part && String(part).trim() !== ''
  );

  if (parts.length === 0) {
    return 'Location unknown';
  }

  return parts.join(', ');
}