Screens.customers = makeParties({
  key:'customers', title:'أرصدة العملاء', newTitle:'عميل جديد',
  totLabel:'إجمالي اللي لينا عند العملاء', balLabel:'المبلغ اللي عليه لنا',
  payLabel:'استلام مبلغ من عميل', docKey:'sales', docLabel:'فاتورة بيع', retLabel:'مرتجع بيع',
  link:'customerId', posColor:'ok', cashDir:1,
  add: c => DB.addCustomer(c)
});
