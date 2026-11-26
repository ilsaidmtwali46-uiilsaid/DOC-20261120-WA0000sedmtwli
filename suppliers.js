Screens.suppliers = makeParties({
  key:'suppliers', title:'أرصدة الموردين', newTitle:'مورد جديد',
  totLabel:'إجمالي اللي علينا للموردين', balLabel:'المبلغ اللي علينا له',
  payLabel:'سداد مبلغ لمورد', docKey:'purchases', docLabel:'فاتورة شراء', retLabel:'مرتجع شراء',
  link:'supplierId', posColor:'warn', cashDir:-1,
  add: s => DB.addSupplier(s)
});
