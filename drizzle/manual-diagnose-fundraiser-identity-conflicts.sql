-- READ ONLY: run this entire SELECT in the same Neon database/branch as the app.
-- It returns only assignments containing different corrected identities.
-- No profiles, receipts, amounts or issued document numbers are changed.
-- Includes the user's previously confirmed Maulana Dilbar = Dilbar Raza alias.
WITH corrected_names(source_row,corrected_name) AS (
  VALUES
    (199,'Dilbar Raza'),
    (200,'Dilbar Raza'),
    (5,'Aasik Khan'),
    (14,'Maulana Raunaque'),
    (27,'Aasik Khan'),
    (28,'Aasik Khan'),
    (29,'Aasik Khan'),
    (36,'Quari Gholam Ghaus'),
    (37,'Aasik Khan'),
    (49,'Aasik Khan'),
    (51,'Moiz Aalam'),
    (64,'Shaikh Riyazat Husain'),
    (71,'Aasik Khan'),
    (72,'Aasik Khan'),
    (76,'Shaikh Gholam Rabbani'),
    (77,'Aasik Khan'),
    (83,'Aasik Khan'),
    (87,'Shaikh Riyazat Husain'),
    (88,'Shaikh Gholam Rabbani'),
    (89,'Aasik Khan'),
    (91,'Aasik Khan'),
    (92,'Shaikh Riyazat Husain'),
    (93,'Shaikh Gholam Rabbani'),
    (94,'Aasik Khan'),
    (95,'Shaikh Gholam Rabbani'),
    (97,'Aasik Khan'),
    (98,'Aasik Khan'),
    (99,'Shaikh Riyazat Husain'),
    (100,'Shaikh Gholam Rabbani'),
    (101,'Shaikh Gholam Rabbani'),
    (102,'Shaikh Gholam Rabbani'),
    (103,'Shaikh Gholam Rabbani'),
    (104,'Shaikh Gholam Rabbani'),
    (105,'Shaikh Gholam Rabbani'),
    (106,'Shaikh Gholam Rabbani'),
    (107,'Shaikh Gholam Rabbani'),
    (108,'Shaikh Gholam Rabbani'),
    (111,'Aasik Khan'),
    (119,'Aasik Khan'),
    (121,'Imdad Alam'),
    (124,'Imdad Alam'),
    (126,'Aasik Khan'),
    (127,'Aasik Khan'),
    (128,'Aasik Khan'),
    (140,'Aasik Khan'),
    (141,'Aasik Khan'),
    (146,'Aasik Khan'),
    (148,'Aasik Khan'),
    (160,'Shaikh Akmal Husain'),
    (190,'Aasik Khan'),
    (191,'Aasik Khan'),
    (192,'Shaikh Riyazat Husain'),
    (197,'Shaikh Gholam Rabbani'),
    (198,'Aasik Khan'),
    (203,'Aasik Khan'),
    (205,'Aasik Khan'),
    (206,'Aasik Khan'),
    (208,'Aasik Khan'),
    (213,'Aasik Khan'),
    (215,'Shaikh Gholam Rabbani'),
    (217,'Aasik Khan'),
    (218,'Aasik Khan'),
    (219,'Shaikh Gholam Rabbani'),
    (220,'Aasik Khan'),
    (221,'Aasik Khan'),
    (222,'Aasik Khan'),
    (223,'Aasik Khan'),
    (224,'Aasik Khan'),
    (233,'Shaikh Gholam Rabbani'),
    (239,'Aasik Khan'),
    (245,'Aasik Khan'),
    (247,'Imdad Alam'),
    (248,'Imdad Alam'),
    (249,'Imdad Alam'),
    (262,'Aasik Khan'),
    (272,'Aasik Khan'),
    (273,'Aasik Khan'),
    (274,'Aasik Khan'),
    (302,'Aasik Khan'),
    (303,'Aasik Khan'),
    (304,'Dilbar Raza'),
    (310,'Aasik Khan'),
    (315,'Aasik Khan'),
    (317,'Aasik Khan'),
    (319,'Aasik Khan')
), named_rows AS (
  SELECT l.source_row,l.assignment_id,l.return_id,l.book_id,l.receipt_id,l.assumed_receipt_number,
    btrim(coalesce(l.source_data->>'Fundraiser Name','')) AS original_name,
    coalesce(c.corrected_name,btrim(coalesce(l.source_data->>'Fundraiser Name',''))) AS corrected_name,
    l.source_data->>'Collection Amount' AS original_collection_rupees,
    l.source_data->>'Commission Amount' AS original_commission_rupees
  FROM public.legacy_collection_imports l
  LEFT JOIN corrected_names c ON c.source_row=l.source_row
  WHERE l.source_key='Book3_v1:Sheet1:'||l.source_row::text AND l.status='IMPORTED'
), conflicting_assignments AS (
  SELECT assignment_id FROM named_rows WHERE corrected_name<>''
  GROUP BY assignment_id HAVING count(DISTINCT corrected_name)>1
)
SELECT a.number AS assignment_number,a.collector_name AS current_fundraiser,
  (SELECT count(*) FROM public.book_cases k WHERE k.assignment_id=a.id) AS assignment_book_count,
  jsonb_agg(jsonb_build_object(
    'excelRow',n.source_row,'originalName',n.original_name,'correctedName',n.corrected_name,
    'book',b.book_number,'edition',b.edition_name_en,'bookId',n.book_id,
    'submission',r.number,'receipt',n.assumed_receipt_number,'receiptId',n.receipt_id,
    'originalCollectionRupees',n.original_collection_rupees,
    'originalCommissionRupees',n.original_commission_rupees
  ) ORDER BY n.source_row) AS affected_rows
FROM conflicting_assignments conflict JOIN public.book_assignments a ON a.id=conflict.assignment_id
JOIN named_rows n ON n.assignment_id=a.id
LEFT JOIN public.books b ON b.id=n.book_id
LEFT JOIN public.book_returns r ON r.id=n.return_id
GROUP BY a.id,a.number,a.collector_name ORDER BY a.number;
